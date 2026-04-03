// ============================================================
//  DEVDARSHAN – SHARED CROWD ENGINE
//  All values are derived from the REAL system clock.
//  No Math.random() is used for primary crowd figures.
// ============================================================

// ── Authentic Indian-temple hourly crowd curve (% of max 5000) ──
//    index = hour of day (0–23)
const HOURLY_PCT = [
  2, 2, 1, 1, 3,   // 00-04  temple mostly closed / night
  8, 25, 48, 66, 82,  // 05-09  Mangala aarti → morning peak
  89, 93, 87, 68, 48, // 10-14  midday peak → lunch lull
  42, 57, 74, 96, 91, // 15-19  afternoon → Sandhya aarti PEAK
  72, 50, 28, 8       // 20-23  evening taper → closing
];

// Zone contribution weights (must sum ≤ 1)
const ZONE_WEIGHTS = {
  'main-hall':  0.22,
  'entry-gate': 0.12,
  'sanctum':    0.08,
  'prasad':     0.10,
  'north-path': 0.14,
  'south-path': 0.12,
  'parking':    0.14,
  'donation':   0.08
};

const ZONE_MAX = {
  'main-hall':  800, 'entry-gate': 400, 'sanctum': 300,
  'prasad':     250, 'north-path': 500, 'south-path': 450,
  'parking':    600, 'donation':   200
};

/**
 * Returns the day-type multiplier based on real day-of-week.
 * Friday/Saturday = "weekend" traffic, Sunday = high.
 */
function getDayMultiplier() {
  const day = new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
  if (day === 0) return 1.55;      // Sunday – highest
  if (day === 6) return 1.40;      // Saturday
  if (day === 5) return 1.20;      // Friday
  return 1.00;                     // Mon-Thu
}

/**
 * Returns crowd count for a given hour using real-world curve.
 * Optional multiplier for weekend/festival override.
 */
function crowdAtHour(hour, multiplier) {
  multiplier = multiplier || getDayMultiplier();
  return Math.round((HOURLY_PCT[hour] / 100) * 5000 * multiplier);
}

/**
 * Returns the CURRENT crowd count (for right now).
 * Uses real system hour + minute interpolation.
 */
function getCurrentCrowd() {
  const now   = new Date();
  const h     = now.getHours();
  const m     = now.getMinutes();
  const mul   = getDayMultiplier();
  const base  = crowdAtHour(h, mul);
  const next  = crowdAtHour((h + 1) % 24, mul);
  return Math.round(base + (next - base) * (m / 60));
}

/**
 * Returns crowd array for the full 24 h of today (real curve).
 */
function getTodayCrowdArray() {
  const mul = getDayMultiplier();
  return HOURLY_PCT.map((_, h) => crowdAtHour(h, mul));
}

/**
 * Crowd level label from count.
 */
function crowdLevel(count) {
  if (count < 500)  return 'low';
  if (count < 2000) return 'medium';
  return 'high';
}

/**
 * Derived wait time (minutes) from crowd.
 */
function waitTime(count) {
  if (count < 500)  return '~5 min';
  if (count < 1200) return '~12 min';
  if (count < 2500) return '~22 min';
  if (count < 3500) return '~38 min';
  return '~55 min';
}

/**
 * Zone populations derived from current crowd (deterministic).
 */
function getZonePopulations() {
  const total = getCurrentCrowd();
  const pops  = {};
  Object.keys(ZONE_WEIGHTS).forEach(z => {
    pops[z] = Math.round(total * ZONE_WEIGHTS[z]);
  });
  return pops;
}

/**
 * Slots booked today — count increases as the day progresses.
 * Based on how many 30-min slots are "past" relative to now.
 */
function getSlotsBookedToday() {
  const h   = new Date().getHours();
  const m   = new Date().getMinutes();
  const minsElapsed = h * 60 + m;
  // Temple open 06:00–21:00 = 900 min = 30 slots of 30 min.
  // Each past slot averages 60 devotees booked.
  const pastSlots = Math.max(0, Math.floor((minsElapsed - 360) / 30));
  return Math.min(pastSlots * 60, 1800);
}

/**
 * Total pilgrims passed through today (cumulative).
 */
function getTotalPilgrimsToday() {
  const h   = new Date().getHours();
  const mul = getDayMultiplier();
  let total = 0;
  for (let i = 0; i <= h; i++) total += crowdAtHour(i, mul);
  return Math.round(total / 2); // average throughput
}

/**
 * Active alerts based on current crowd.
 */
function getDynamicAlerts(count) {
  const alerts = [];
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  if (count >= 4000) {
    alerts.push({ id:1, level:'high', icon:'🚨', title:'Critical Overcrowding – Sanctum & Main Hall',
      desc:`Current pilgrims (${count.toLocaleString()}) exceed 80% of temple capacity. Immediate crowd diversion required.`,
      zone:'Main Hall', time: now, acknowledged:false });
  }
  if (count >= 2500) {
    alerts.push({ id:2, level:'high', icon:'🚨', title:'Overcrowding – Main Hall',
      desc:'Main Hall crowd exceeds safe limit. Extra staff required.',
      zone:'Main Hall', time: now, acknowledged:false });
  }
  if (count >= 1800) {
    alerts.push({ id:3, level:'medium', icon:'⚠️', title:'Queue Buildup – Prasad Counter',
      desc:'Prasad counter queue exceeds 80 people. Consider adding extra counter.',
      zone:'Prasad Counter', time: now, acknowledged:false });
  }
  if (count >= 1200) {
    alerts.push({ id:4, level:'medium', icon:'⚠️', title:'Entry Gate Wait Time High',
      desc:`Average wait at main gate: ${waitTime(count)}. Consider opening additional lanes.`,
      zone:'Entry Gate', time: now, acknowledged:false });
  }
  // Always add an informational alert about the next peak
  const h = new Date().getHours();
  const nextPeak = h < 11 ? '11:00 AM' : h < 18 ? '6:00 PM' : 'tomorrow 6:00 AM';
  alerts.push({ id:5, level:'low', icon:'ℹ️', title:`Peak Crowd Expected at ${nextPeak}`,
    desc:`AI predicts next crowd peak around ${nextPeak}. Prepare staff & gates in advance.`,
    zone:'All Zones', time: now, acknowledged:true });

  return alerts;
}

/**
 * Slot data for the 20 standard half-hour slots.
 * Past slots = full/completed, current slot = almost-full, future = based on crowd curve.
 */
const ALL_SLOTS = [
  '06:00–06:30','06:30–07:00','07:00–07:30','07:30–08:00',
  '08:00–08:30','08:30–09:00','09:00–09:30','09:30–10:00',
  '10:00–10:30','10:30–11:00','11:00–11:30','11:30–12:00',
  '12:00–12:30','12:30–13:00','16:00–16:30','16:30–17:00',
  '17:00–17:30','17:30–18:00','18:00–18:30','18:30–19:00'
];

function getSlotStartHour(slot) {
  const parts = slot.split('–')[0].split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function getSlotData() {
  const now      = new Date();
  const nowMins  = now.getHours() * 60 + now.getMinutes();
  const total    = 80;
  const reserve  = 20; // 25% of 80
  const regular  = 60;
  const mul      = getDayMultiplier();

  return ALL_SLOTS.map((slot, i) => {
    const slotMins  = getSlotStartHour(slot);
    const isPast    = slotMins + 30 <= nowMins;
    const isCurrent = slotMins <= nowMins && nowMins < slotMins + 30;
    const slotHour  = Math.floor(slotMins / 60);
    const pct       = HOURLY_PCT[slotHour] / 100;

    let booked, resUsed;
    if (isPast) {
      // Past slots: fully booked proportional to crowd curve
      booked  = Math.round(regular * Math.min(1, pct * mul));
      resUsed = booked >= regular ? Math.round(reserve * 0.6 * pct) : 0;
    } else if (isCurrent) {
      booked  = Math.round(regular * Math.min(0.95, pct * mul));
      resUsed = 0;
    } else {
      // Future: demand-based booking prediction
      booked  = Math.round(regular * Math.min(0.85, pct * mul * 0.7));
      resUsed = 0;
    }

    const available = Math.max(0, regular - booked);
    let status;
    if (available === 0) status = 'FULL';
    else if (available <= 8) status = 'ALMOST FULL';
    else status = 'AVAILABLE';

    return { slot, total, regular, reserve, booked, available, resUsed, status, isPast, isCurrent };
  });
}

// 7-day forecast (deterministic from day-of-week)
function getWeekForecast() {
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today  = new Date().getDay();
  const muls   = [1.55, 1.0, 1.0, 1.05, 1.1, 1.2, 1.4];
  const result = [];
  for (let i = 0; i < 7; i++) {
    const dayIdx = (today + i) % 7;
    const m      = muls[dayIdx];
    const peak   = Math.round((HOURLY_PCT[18] / 100) * 5000 * m);
    const label  = i === 0 ? 'Today' : days[dayIdx];
    const lvl    = peak < 1500 ? 'low' : peak < 3000 ? 'medium' : 'high';
    result.push({ label, peak, level: lvl, dayIdx });
  }
  return result;
}

// Staff required per zone based on crowd
function getStaffRequired(count) {
  const factor = count / 5000;
  return [
    { zone:'🏛️ Main Hall',      required: Math.round(6 + factor * 10), deployed: Math.round(5 + factor * 9)  },
    { zone:'🚪 Entry Gate',     required: Math.round(4 + factor * 8),  deployed: Math.round(4 + factor * 8)  },
    { zone:'⛩️ Sanctum',        required: Math.round(3 + factor * 5),  deployed: Math.round(3 + factor * 4)  },
    { zone:'🍬 Prasad Counter', required: Math.round(2 + factor * 4),  deployed: Math.round(2 + factor * 3)  },
    { zone:'🧭 North Path',     required: Math.round(3 + factor * 4),  deployed: Math.round(3 + factor * 5)  },
    { zone:'🧭 South Path',     required: Math.round(3 + factor * 4),  deployed: Math.round(3 + factor * 4)  },
    { zone:'🅿️ Parking',        required: Math.round(4 + factor * 6),  deployed: Math.round(3 + factor * 5)  },
    { zone:'💰 Donation Hall',  required: Math.round(2 + factor * 3),  deployed: Math.round(2 + factor * 3)  },
    { zone:'♿ Priority Zone',  required: 2,                            deployed: 2                            }
  ];
}
