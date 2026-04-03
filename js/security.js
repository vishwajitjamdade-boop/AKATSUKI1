// ===== SECURITY DASHBOARD – API-CONNECTED =====
// Depends on: api.js (loaded before this file)

let charts = {};
let alertsCache = [];
let gatesCache  = [];
let liveInterval = null;

function setEl(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function crowdColor(c){ return c<500?'#66bb6a':c<2000?'#ffd54f':'#ef5350'; }
function crowdEmoji(c){ return c<500?'🟢':c<2000?'🟡':'🔴'; }
function crowdLabel(c){ return c<500?'LOW':c<2000?'MEDIUM':'HIGH'; }

// ── INIT ──────────────────────────────────────────────────────
async function init(){
  updateClock(); setInterval(updateClock,1000);

  // Show login info
  const lt=sessionStorage.getItem('dd_login_time');
  if(lt){ const el=document.getElementById('loginTime'); if(el) el.textContent=new Date(lt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
  const nm=document.getElementById('adminNameDisplay');
  if(nm) nm.textContent=sessionStorage.getItem('dd_name')||'Admin';

  await initDashboard();
  await initGatesGrid();
  await initAIPredictionChart();
  await initWeekForecast();

  // Set today's date in prediction form
  const pd=document.getElementById('predDate');
  if(pd) pd.value=new Date().toISOString().split('T')[0];
  const dow=new Date().getDay();
  const pdt=document.getElementById('predDayType');
  if(pdt) pdt.value=(dow===0||dow===6)?'weekend':'weekday';

  liveInterval=setInterval(liveMinuteTick,60000);
}

function updateClock(){
  const el=document.getElementById('liveClock');
  if(el) el.textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function initDashboard(){
  const [stats,today] = await Promise.all([apiGet('/stats/today'), apiGet('/crowd/today')]);
  if(!stats) return;

  const c=stats.crowd;
  setEl('kpiTotal',   c.toLocaleString('en-IN'));
  setEl('kpiBooked',  stats.totalBookings.toLocaleString('en-IN'));
  setEl('kpiWait',    stats.waitTime);
  setEl('kpiGates',   stats.openGates+'/9');
  setEl('kpiAlerts',  alertsCache.filter(a=>!a.is_acknowledged).length||'…');

  updateGlobalCrowdPill(c);
  if(today) renderCrowdFlowChart(today.hourly);
  await renderZoneGrid();
}

function updateGlobalCrowdPill(c){
  const pill=document.getElementById('globalCrowdPill'); if(!pill) return;
  const col=crowdColor(c);
  pill.textContent=`${crowdEmoji(c)} ${crowdLabel(c)}`;
  pill.style.cssText=`background:${col}22;color:${col};border:1px solid ${col}55;padding:6px 14px;border-radius:100px;font-size:0.8rem;font-weight:700`;
}

function renderCrowdFlowChart(hourly){
  const ctx=document.getElementById('crowdFlowChart'); if(!ctx) return;
  const now=new Date().getHours();
  const cols=hourly.map((v,i)=>i===now?'#ff6b35':crowdColor(v)+'cc');
  // Update in-place if chart already exists (no destroy = no blink)
  if(charts.crowdFlow){
    charts.crowdFlow.data.datasets[0].data=hourly;
    charts.crowdFlow.data.datasets[0].backgroundColor=cols;
    charts.crowdFlow.update('none'); return;
  }
  charts.crowdFlow=new Chart(ctx,{
    type:'bar',
    data:{ labels:hourly.map((_,i)=>`${String(i).padStart(2,'0')}:00`),
      datasets:[{label:'Pilgrims',data:hourly,backgroundColor:cols,borderRadius:4,borderWidth:0}] },
    options:{ responsive:true, maintainAspectRatio:true, aspectRatio:3,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(12,16,30,0.92)',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#e8eaf6',bodyColor:'rgba(232,234,246,0.7)',
        callbacks:{label:c=>`${crowdEmoji(c.raw)} ${c.raw.toLocaleString('en-IN')} pilgrims`} }},
      scales:{x:{grid:{display:false},ticks:{color:'rgba(232,234,246,0.45)',maxTicksLimit:8}},
        y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,234,246,0.45)'},beginAtZero:true}} }
  });
}

async function renderZoneGrid(){
  const grid=document.getElementById('zoneGrid'); if(!grid) return;
  const zones=await apiGet('/crowd/zones'); if(!zones) return;
  grid.innerHTML='';
  zones.forEach(z=>{
    const col=crowdColor(z.count); const pct=Math.min(100,z.percentage);
    const lvl=pct<50?'low':pct<80?'med':'high';
    const div=document.createElement('div'); div.className=`zone-card zone-${lvl}`; div.id=`zone-${z.id}`;
    div.innerHTML=`<div class="zone-name">${z.name}</div><div class="zone-count" style="color:${col}">${z.count.toLocaleString('en-IN')}</div><div class="zone-bar"><div class="zone-bar-fill" style="width:${pct}%;background:${col}"></div></div><div class="zone-status">${crowdEmoji(z.count)} ${pct}% capacity</div>`;
    grid.appendChild(div);
  });
}

// ── CROWD MONITOR ─────────────────────────────────────────────
async function initCrowdMonitor(){
  const [current,zones]=await Promise.all([apiGet('/crowd/current'),apiGet('/crowd/zones')]);
  if(!current||!zones) return;
  const counts=zones.map(z=>z.count);
  const low=counts.filter(v=>v<500).length, med=counts.filter(v=>v>=500&&v<2000).length, high=counts.filter(v=>v>=2000).length;
  setEl('lvlLowCount',`${low} zones`); setEl('lvlMedCount',`${med} zones`); setEl('lvlHighCount',`${high} zones`);
  renderRealTimeChart(zones);
  renderTempleMap(zones);
}

function renderRealTimeChart(zones){
  const ctx=document.getElementById('realTimeChart'); if(!ctx) return;
  if(charts.realTime){
    charts.realTime.data.datasets[0].data=zones.map(z=>z.count);
    charts.realTime.data.datasets[0].backgroundColor=zones.map(z=>crowdColor(z.count)+'cc');
    charts.realTime.update('none'); return;
  }
  charts.realTime=new Chart(ctx,{
    type:'bar',
    data:{labels:zones.map(z=>z.name.replace(/^[^\s]+ /,'')),
      datasets:[{label:'People',data:zones.map(z=>z.count),backgroundColor:zones.map(z=>crowdColor(z.count)+'cc'),borderRadius:6}]},
    options:{responsive:true, maintainAspectRatio:true, aspectRatio:2.5,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(12,16,30,0.92)',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#e8eaf6',bodyColor:'rgba(232,234,246,0.7)'}},
      scales:{x:{grid:{display:false},ticks:{color:'rgba(232,234,246,0.45)',maxRotation:30}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,234,246,0.45)'},beginAtZero:true}}}
  });
}

function renderTempleMap(zones){
  const map=document.getElementById('templeMapViz'); if(!map) return;
  map.innerHTML='';
  const pos=[{id:'main-hall',top:'40%',left:'40%'},{id:'entry-gate',top:'75%',left:'40%'},{id:'sanctum',top:'18%',left:'40%'},
    {id:'prasad',top:'55%',left:'68%'},{id:'north-path',top:'8%',left:'20%'},{id:'south-path',top:'80%',left:'20%'},
    {id:'parking',top:'88%',left:'62%'},{id:'donation',top:'28%',left:'72%'}];
  pos.forEach(p=>{
    const z=zones.find(z=>z.id===p.id); if(!z) return;
    const col=crowdColor(z.count);
    const btn=document.createElement('div'); btn.className='map-zone-btn';
    btn.style.cssText=`top:${p.top};left:${p.left};background:${col}22;border-color:${col};color:#fff;transform:translateX(-50%)`;
    btn.innerHTML=`${z.name.split(' ')[0]}<br><small>${z.count.toLocaleString('en-IN')}</small>`;
    map.appendChild(btn);
  });
}

function updateDiversion(key,el){
  const s=document.getElementById(`div${key}Status`);
  if(s){s.textContent=el.checked?'ON':'OFF';s.style.color=el.checked?'#66bb6a':'rgba(232,234,246,0.5)';}
  if(el.checked) showToast(`✅ Diversion ${key} activated`,'success');
}

// ── GATE CONTROL ─────────────────────────────────────────────
async function initGatesGrid(){
  gatesCache=await apiGet('/gates')||[];
  const grid=document.getElementById('gatesGrid'); if(!grid) return;
  grid.innerHTML='';
  const stats=await apiGet('/crowd/current')||{total:0};
  gatesCache.forEach(gate=>{
    const flow=Math.round((gate.capacity/500)*(stats.total/5000)*80+5);
    const card=document.createElement('div'); card.className='gate-card'; card.id=`gate-${gate.id}`;
    card.innerHTML=`
      <div class="gate-header">
        <div><div class="gate-name">${gate.id} – ${gate.name}</div><div class="gate-type">${gate.type}</div></div>
        <div class="gate-status-chip ${gate.is_open?'gate-open':'gate-closed'}" id="gate-chip-${gate.id}">${gate.is_open?'● OPEN':'● CLOSED'}</div>
      </div>
      <div class="gate-info">Capacity: ${gate.capacity}/hr &nbsp;|&nbsp; Flow: ${gate.is_open?flow:0} ppl/min</div>
      <button class="gate-toggle-btn" id="gate-btn-${gate.id}" onclick="toggleGate('${gate.id}')"
        style="background:${gate.is_open?'rgba(239,83,80,0.12)':'rgba(102,187,106,0.12)'};color:${gate.is_open?'#ef5350':'#66bb6a'};border:1px solid ${gate.is_open?'rgba(239,83,80,0.3)':'rgba(102,187,106,0.3)'}">
        ${gate.is_open?'🔒 Close Gate':'✅ Open Gate'}
      </button>`;
    grid.appendChild(card);
  });
  updateGateSummary();
}

async function toggleGate(id){
  const gate=gatesCache.find(g=>g.id===id); if(!gate) return;
  gate.is_open=gate.is_open?0:1;
  await apiPut(`/gates/${id}`,{is_open:gate.is_open});
  const chip=document.getElementById(`gate-chip-${id}`), btn=document.getElementById(`gate-btn-${id}`);
  if(chip){chip.className=`gate-status-chip ${gate.is_open?'gate-open':'gate-closed'}`;chip.textContent=gate.is_open?'● OPEN':'● CLOSED';}
  if(btn){btn.style.background=gate.is_open?'rgba(239,83,80,0.12)':'rgba(102,187,106,0.12)';btn.style.color=gate.is_open?'#ef5350':'#66bb6a';btn.textContent=gate.is_open?'🔒 Close Gate':'✅ Open Gate';}
  updateGateSummary();
  showToast(`Gate ${id} ${gate.is_open?'OPENED ✅':'CLOSED 🔒'}`,gate.is_open?'success':'warning');
}

async function setAllGates(open){
  await apiPut('/gates',{is_open:open});
  await initGatesGrid();
  showToast(`All gates ${open?'OPENED ✅':'CLOSED 🔴'}`,open?'success':'warning');
}

async function emergencyClose(){
  await apiPut('/gates',{is_open:false});
  await initGatesGrid();
  showToast('🚨 Emergency close – all gates locked!','error');
}

function updateGateSummary(){
  const open=gatesCache.filter(g=>g.is_open).length;
  setEl('gsSummaryOpen',`${open} Open`); setEl('gsSummaryClosed',`${gatesCache.length-open} Closed`); setEl('kpiGates',`${open}/${gatesCache.length}`);
}

// ── AI PREDICTION ─────────────────────────────────────────────
async function initAIPredictionChart(){
  const data=await apiGet('/ai/today24h'); if(!data) return;
  const ctx=document.getElementById('predictionChart'); if(!ctx) return;
  const hiB=data.predictions.map(v=>Math.round(v*1.18));
  const loB=data.predictions.map(v=>Math.round(v*0.82));
  const lbls=data.predictions.map((_,i)=>`${String(i).padStart(2,'0')}:00`);
  if(charts.prediction){
    charts.prediction.data.datasets[0].data=data.predictions;
    charts.prediction.data.datasets[1].data=hiB;
    charts.prediction.data.datasets[2].data=loB;
    charts.prediction.update('none'); return;
  }
  charts.prediction=new Chart(ctx,{
    type:'line',
    data:{labels:lbls,datasets:[
      {label:'AI Predicted',data:data.predictions,borderColor:'#ce93d8',backgroundColor:'rgba(206,147,216,0.08)',fill:false,tension:0.4,borderWidth:2.5},
      {label:'Upper Bound',data:hiB,borderColor:'rgba(239,83,80,0.3)',fill:'+1',tension:0.4,borderWidth:1,borderDash:[4,4],pointRadius:0},
      {label:'Lower Bound',data:loB,borderColor:'rgba(102,187,106,0.3)',fill:false,tension:0.4,borderWidth:1,borderDash:[4,4],pointRadius:0}
    ]},
    options:{responsive:true, maintainAspectRatio:true, aspectRatio:2.8,
      plugins:{legend:{labels:{color:'rgba(232,234,246,0.55)',boxWidth:12}},tooltip:{mode:'index',intersect:false,backgroundColor:'rgba(12,16,30,0.92)',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#e8eaf6',bodyColor:'rgba(232,234,246,0.7)'}},
      scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,234,246,0.45)',maxTicksLimit:8}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,234,246,0.45)'},beginAtZero:true}}}
  });
}

async function initWeekForecast(){
  const forecast=await apiGet('/ai/week'); if(!forecast) return;
  const ctr=document.getElementById('forecastWeek'); if(!ctr) return;
  ctr.innerHTML='';
  forecast.forEach((day,i)=>{
    const em=day.level==='low'?'🟢':day.level==='medium'?'🟡':'🔴';
    const col=day.level==='low'?'#66bb6a':day.level==='medium'?'#ffd54f':'#ef5350';
    const div=document.createElement('div'); div.className=`forecast-day${i===0?' today-day':''}`;
    div.innerHTML=`<div class="fd-day">${day.label}</div><span class="fd-emoji">${em}</span><div class="fd-level" style="color:${col}">${day.level.toUpperCase()}</div><div class="fd-count">~${day.peak.toLocaleString('en-IN')}</div>`;
    ctr.appendChild(div);
  });
}

async function runAIPrediction(){
  const date=document.getElementById('predDate').value;
  const timeStr=document.getElementById('predTime').value;
  const dayType=document.getElementById('predDayType').value;
  const weather=document.getElementById('predWeather').value;
  const hour=parseInt(timeStr)||new Date().getHours();

  const result=await apiGet(`/ai/predict?hour=${hour}&dayType=${dayType}&weather=${encodeURIComponent(weather)}`);
  if(!result) return;

  const col=crowdColor(result.predicted);
  const recs=result.predicted>=3500?['🚦 Open ALL 9 gates','👮 Deploy all staff immediately','📢 Broadcast crowd diversion']:
    result.predicted>=1500?['🚦 Keep 7-8 gates open','👮 Deploy 6-8 extra staff','📊 Monitor every 15 min']:
    ['✅ Normal operations','📊 Routine monitoring every 30 min'];

  document.getElementById('aiResultContent').innerHTML=`
    <div class="ai-prediction-card">
      <div class="ai-crowd-level" style="background:${col}18;border:1px solid ${col}44">
        <span class="level-emoji">${crowdEmoji(result.predicted)}</span>
        <div class="level-text" style="color:${col}">${crowdLabel(result.predicted)} CROWD</div>
        <div class="level-count-pred" style="color:rgba(232,234,246,0.7)">
          ~${result.predicted.toLocaleString('en-IN')} pilgrims · ${result.confidence}% confidence
          <br><small style="color:rgba(232,234,246,0.45)">Based on ${result.historicalSamples} historical records · ${result.waitTime}</small>
        </div>
      </div>
      <div class="ai-insights">
        <div class="ai-insight-item">📅 <span><strong>${dayType}</strong></span></div>
        <div class="ai-insight-item">🌤️ <span>${weather}</span></div>
        <div class="ai-insight-item">📅 <span>${date} at ${timeStr}</span></div>
      </div>
      <div class="ai-recs"><h4>📋 AI Recommendations</h4>${recs.map(r=>`<div class="ai-rec-item">${r}</div>`).join('')}</div>
    </div>`;
  showToast(`🤖 ${result.predicted.toLocaleString('en-IN')} predicted (${result.confidence}% confidence)`,result.predicted>=3500?'error':result.predicted>=1500?'warning':'success');
}

// ── ALERTS ────────────────────────────────────────────────────
async function renderAlerts(filter){
  filter=filter||'all';
  alertsCache=await apiGet('/alerts')||[];
  const list=document.getElementById('alertsList'); if(!list) return;
  const items=filter==='all'?alertsCache:alertsCache.filter(a=>a.level===filter);
  if(!items.length){list.innerHTML='<div style="color:rgba(232,234,246,0.4);text-align:center;padding:32px">No alerts</div>';return;}
  list.innerHTML='';
  const icons={high:'🚨',medium:'⚠️',low:'ℹ️'};
  items.forEach(a=>{
    const div=document.createElement('div'); div.className=`alert-item ${a.level}`;
    div.innerHTML=`
      <div class="alert-icon">${icons[a.level]||'ℹ️'}</div>
      <div class="alert-body">
        <div class="alert-title">${a.title}${a.is_acknowledged?'<span style="color:#66bb6a;font-size:0.75rem;margin-left:8px">✓ Ack</span>':''}</div>
        <div class="alert-desc">${a.description||''}</div>
        <div class="alert-meta"><span class="alert-zone">📍 ${a.zone||''}</span><span>🕐 ${a.created_at||''}</span></div>
      </div>
      <div class="alert-actions">
        ${!a.is_acknowledged?`<button class="alert-action-btn ack-btn" onclick="acknowledgeAlert('${a.id}')">✓ Ack</button>`:''}
        ${!a.id.startsWith('dyn-')?`<button class="alert-action-btn resolve-btn" onclick="resolveAlert('${a.id}')">✅ Resolve</button>`:''}
      </div>`;
    list.appendChild(div);
  });
  const badge=document.getElementById('alertBadge');
  const unread=alertsCache.filter(a=>!a.is_acknowledged).length;
  if(badge) badge.textContent=unread;
  setEl('kpiAlerts',alertsCache.length);
}

function filterAlerts(f,btn){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderAlerts(f);
}
async function acknowledgeAlert(id){ await apiPost(`/alerts/${id}/acknowledge`,{}); renderAlerts(); }
async function resolveAlert(id){ await apiPost(`/alerts/${id}/resolve`,{}); renderAlerts(); showToast('✅ Alert resolved','success'); }
function clearAllAlerts(){ alertsCache=[]; document.getElementById('alertsList').innerHTML='<div style="color:rgba(232,234,246,0.4);text-align:center;padding:32px">No alerts</div>'; }

async function sendBroadcast(){
  const type=document.getElementById('broadcastType').value;
  const msg=document.getElementById('broadcastMsg').value||type;
  await apiPost('/alerts',{level:'low',title:'📢 Broadcast: '+msg.slice(0,60),description:msg,zone:'All Zones'});
  const log=document.getElementById('broadcastLog');
  const t=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  const e=document.createElement('div'); e.className='blog-entry'; e.innerHTML=`<span class="blog-time">${t}</span>${msg}`;
  log.appendChild(e); log.scrollTop=log.scrollHeight;
  document.getElementById('broadcastMsg').value='';
  showToast('📡 Broadcast sent','success');
}

function triggerEmergency(){ showSection('alerts'); sendBroadcast(); showToast('🚨 EMERGENCY BROADCAST SENT','error'); }

// ── SLOT MONITOR ─────────────────────────────────────────────
async function initSlotTable(){
  const [slots,allBookings]=await Promise.all([apiGet('/slots'),apiGet('/slots/all')]);
  if(!slots) return;
  const tbody=document.getElementById('slotTableBody'); if(!tbody) return;
  tbody.innerHTML='';
  let filled=0,resUsed=0;
  slots.forEach(s=>{
    if(s.booked>=s.regular) filled++;
    const bu=allBookings?allBookings.filter(b=>b.slot_time===s.slot):[];
    const ru=bu.filter(b=>b.is_reserve).length;
    resUsed+=ru;
    const sc=s.status==='DONE'?'#4fc3f7':s.status==='FULL'?'#ef5350':s.status==='ALMOST FULL'?'#ffd54f':'#66bb6a';
    const sbg=`${sc}22`;
    const tr=document.createElement('tr');
    if(s.isCurrent) tr.style.background='rgba(79,195,247,0.06)';
    if(s.isPast)    tr.style.opacity='0.6';
    tr.innerHTML=`<td>${s.isPast?'✔ ':s.isCurrent?'▶ ':''}${s.slot}</td><td>${s.total}</td><td>${s.booked}/${s.regular}</td><td style="color:#4fc3f7">${s.reserve}</td><td>${ru>0?`<span style="color:#ffd54f">${ru}</span>`:ru}</td><td><span class="slot-status-chip" style="background:${sbg};color:${sc}">${s.isPast?'DONE':s.status}</span></td><td><button class="slot-manage-btn" onclick="showToast('Slot ${s.slot}','info')">Manage</button></td>`;
    tbody.appendChild(tr);
  });

  // Summary
  const g=document.getElementById('slotSummaryGrid');
  if(g) g.innerHTML=`<div class="slot-stat-card"><div class="slot-stat-val" style="color:#4fc3f7">${slots.length}</div><div class="slot-stat-label">Total Slots</div></div><div class="slot-stat-card"><div class="slot-stat-val" style="color:#66bb6a">${filled}</div><div class="slot-stat-label">Full</div></div><div class="slot-stat-card"><div class="slot-stat-val" style="color:#ffd54f">${slots.length-filled}</div><div class="slot-stat-label">Available</div></div><div class="slot-stat-card"><div class="slot-stat-val" style="color:#ce93d8">${allBookings?allBookings.length:0}</div><div class="slot-stat-label">Total Bookings</div></div>`;

  renderSlotFillChart(slots);

  // ── Render devotee bookings list ──────────────────────────────
  const listEl=document.getElementById('devoteeBookingsList'); if(!listEl) return;
  if(!allBookings||!allBookings.length){
    listEl.innerHTML='<div style="color:rgba(232,234,246,0.4);text-align:center;padding:32px">No bookings yet. Bookings appear here once a devotee books a slot.</div>';
    return;
  }
  const TNAMES={somnath:'Somnath',dwarkadhish:'Dwarkadhish',ambaji:'Ambaji',pavagadh:'Pavagadh'};
  listEl.innerHTML='';
  const sorted=[...allBookings].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  sorted.forEach(b=>{
    const stColor=b.status==='upcoming'?'#ce93d8':b.status==='cancelled'?'#ef5350':'#66bb6a';
    const stLabel=b.status==='upcoming'?'🟡 Upcoming':b.status==='cancelled'?'🔴 Cancelled':'✅ Completed';
    const temple=TNAMES[b.temple_id||b.temple]||b.temple_id||b.temple||'—';
    const created=b.created_at?new Date(b.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—';
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap';
    row.innerHTML=`
      <div style="font-size:1.3rem;font-weight:900;color:#f5a623;font-family:monospace;min-width:72px">${b.token||'—'}</div>
      <div style="flex:1;min-width:160px">
        <div style="font-weight:600;font-size:0.9rem">${b.name||'Devotee'}</div>
        <div style="font-size:0.78rem;color:rgba(232,234,246,0.5)">🛕 ${temple} &nbsp;|&nbsp; ⏰ ${b.slot_time||'—'} &nbsp;|&nbsp; 📅 ${b.booking_date||'—'}</div>
      </div>
      <div style="font-size:0.8rem;color:rgba(232,234,246,0.5)">👥 ${b.people||1} pax${b.is_reserve?' <span style="color:#ce93d8">💜 Reserve</span>':''}</div>
      <div style="font-size:0.78rem;color:rgba(232,234,246,0.4)">${created}</div>
      <div style="padding:4px 10px;border-radius:100px;font-size:0.72rem;font-weight:700;background:${stColor}22;color:${stColor};border:1px solid ${stColor}44">${stLabel}</div>`;
    listEl.appendChild(row);
  });
}

function renderSlotFillChart(slots){
  const ctx=document.getElementById('slotFillChart'); if(!ctx) return;
  const past=slots.filter(s=>s.isPast).length, curr=slots.filter(s=>s.isCurrent).length, fut=slots.length-past-curr;
  if(charts.slotFill){
    charts.slotFill.data.datasets[0].data=[past,curr,fut];
    charts.slotFill.update('none'); return;
  }
  charts.slotFill=new Chart(ctx,{type:'doughnut',
    data:{labels:['Completed','In Progress','Upcoming'],datasets:[{data:[past,curr,fut],backgroundColor:['rgba(102,187,106,0.8)','rgba(255,213,79,0.8)','rgba(79,195,247,0.4)'],borderWidth:0,hoverOffset:8}]},
    options:{responsive:true, maintainAspectRatio:true, aspectRatio:1.8, plugins:{legend:{labels:{color:'rgba(232,234,246,0.55)',boxWidth:12}}},cutout:'65%'}});
}

// ── STAFF ─────────────────────────────────────────────────────
async function initStaffTable(){
  const current=await apiGet('/crowd/current')||{total:0};
  const c=current.total;
  const f=c/5000;
  const zones=[
    {zone:'🏛️ Main Hall',      required:Math.round(6+f*10), deployed:Math.round(5+f*9) },
    {zone:'🚪 Entry Gate',     required:Math.round(4+f*8),  deployed:Math.round(4+f*8) },
    {zone:'⛩️ Sanctum',        required:Math.round(3+f*5),  deployed:Math.round(3+f*4) },
    {zone:'🍬 Prasad Counter', required:Math.round(2+f*4),  deployed:Math.round(2+f*3) },
    {zone:'🧭 North Path',     required:Math.round(3+f*4),  deployed:Math.round(3+f*5) },
    {zone:'🅿️ Parking',        required:Math.round(4+f*6),  deployed:Math.round(3+f*5) },
    {zone:'♿ Priority Zone',  required:2,                  deployed:2                 }
  ];
  const tbody=document.getElementById('staffTableBody'); if(!tbody) return;
  tbody.innerHTML='';
  zones.forEach(item=>{
    const diff=item.deployed-item.required;
    const st=diff>=0?(diff>1?'excess':'ok'):'under';
    const stTx=st==='ok'?'✅ Optimal':st==='excess'?'⚠️ Excess':'❌ Understaffed';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${item.zone}</td><td>${item.required}</td><td>${item.deployed}</td><td><span class="staff-status-chip status-${st}">${stTx}</span></td><td><button class="deploy-btn" onclick="deployStaff('${item.zone}')">+ Deploy</button></td>`;
    tbody.appendChild(tr);
  });
  renderStaffChart(zones);
}

function renderStaffChart(zones){
  const ctx=document.getElementById('staffChart'); if(!ctx) return;
  if(charts.staff){
    charts.staff.data.datasets[0].data=zones.map(z=>z.required);
    charts.staff.data.datasets[1].data=zones.map(z=>z.deployed);
    charts.staff.update('none'); return;
  }
  charts.staff=new Chart(ctx,{type:'radar',data:{labels:zones.map(z=>z.zone.replace(/^[^\s]+ /,'')),datasets:[
    {label:'Required',data:zones.map(z=>z.required),borderColor:'rgba(79,195,247,0.8)',backgroundColor:'rgba(79,195,247,0.1)',pointRadius:4},
    {label:'Deployed',data:zones.map(z=>z.deployed),borderColor:'rgba(102,187,106,0.8)',backgroundColor:'rgba(102,187,106,0.1)',pointRadius:4}
  ]},options:{responsive:true, maintainAspectRatio:true, aspectRatio:1.6,
    plugins:{legend:{labels:{color:'rgba(232,234,246,0.55)',boxWidth:12}}},
    scales:{r:{grid:{color:'rgba(255,255,255,0.07)'},pointLabels:{color:'rgba(232,234,246,0.5)',font:{size:9}},ticks:{color:'rgba(232,234,246,0.4)',backdropColor:'transparent'}}}}});
}

function deployStaff(zone){ showToast(`👮 Staff deployed to ${zone}`,'success'); }
function autoDeployStaff(){ showToast('🤖 Auto-deployment complete!','success'); initStaffTable(); }

// ── CCTV ─────────────────────────────────────────────────────
async function initCCTV(){
  const zones=await apiGet('/crowd/zones'); if(!zones) return;
  const grid=document.getElementById('cctvGrid'); if(!grid) return;
  grid.innerHTML='';
  const cams=[
    {name:'Main Entry Gate',zoneId:'entry-gate'},{name:'Main Hall – North',zoneId:'main-hall'},
    {name:'Sanctum Sanctorum',zoneId:'sanctum'},{name:'Prasad Counter',zoneId:'prasad'},
    {name:'North Path',zoneId:'north-path'},{name:'South Path',zoneId:'south-path'},
    {name:'Parking Zone A',zoneId:'parking'},{name:'Donation Hall',zoneId:'donation'}
  ];
  cams.forEach(cam=>{
    const z=zones.find(z=>z.id===cam.zoneId)||{count:0,max:400,percentage:0};
    const col=crowdColor(z.count);
    const card=document.createElement('div'); card.className='cctv-card';
    card.innerHTML=`
      <div class="cctv-screen">
        <div class="cctv-overlay"><div class="cctv-cam-icon">📹</div><div class="cctv-zone-label">${cam.name}</div></div>
        <div class="cctv-live-badge"><span style="width:6px;height:6px;background:#fff;border-radius:50%;display:inline-block"></span> LIVE</div>
        <div class="cctv-crowd-bar"><div class="cctv-crowd-bar-fill" style="width:${z.percentage}%;background:${col}"></div></div>
      </div>
      <div class="cctv-info">
        <div class="cctv-info-row"><span class="cctv-name">${cam.name}</span><span class="cctv-people" style="color:${col}">${z.count.toLocaleString('en-IN')}</span></div>
        <div class="cctv-meta">${z.percentage}% density · ${crowdEmoji(z.count)} ${crowdLabel(z.count)}</div>
        <div class="cctv-actions">
          <button class="cctv-action-btn" onclick="showToast('🔍 Zooming into ${cam.name}','info')">🔍 Focus</button>
          <button class="cctv-action-btn" onclick="showToast('👮 Team dispatched','success')">👮 Dispatch</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// ── SECTION NAV ───────────────────────────────────────────────
const TITLES={dashboard:'Overview Dashboard',crowdMonitor:'Live Crowd Monitor',gateControl:'Gate Control System',aiPrediction:'AI Prediction Engine',alerts:'Alert Management',slotMonitor:'Slot Monitoring',staffDeploy:'Staff Deployment',cctv:'CCTV Zone Monitoring'};

async function showSection(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');
  setEl('pageTitle',TITLES[name]||name);
  if(name==='crowdMonitor')  await initCrowdMonitor();
  else if(name==='gateControl'){ updateGateSummary(); }
  else if(name==='alerts')   await renderAlerts();
  else if(name==='slotMonitor') await initSlotTable();
  else if(name==='staffDeploy') await initStaffTable();
  else if(name==='cctv')     await initCCTV();
  if(window.innerWidth<900) document.getElementById('sidebar')?.classList.remove('mobile-open');
}

function toggleSidebar(){
  const sb=document.getElementById('sidebar'),mc=document.querySelector('.main-content');
  if(window.innerWidth<900) sb.classList.toggle('mobile-open');
  else { sb.classList.toggle('collapsed'); mc?.classList.toggle('full'); }
}

async function liveMinuteTick(){
  // Only update TEXT values — never destroy/recreate charts (that causes the blink)
  const stats=await apiGet('/stats/today'); if(!stats) return;
  const c=stats.crowd;
  setEl('kpiTotal',  c.toLocaleString('en-IN'));
  setEl('kpiBooked', stats.totalBookings.toLocaleString('en-IN'));
  setEl('kpiWait',   stats.waitTime);
  setEl('kpiGates',  stats.openGates+'/9');
  updateGlobalCrowdPill(c);
  // Refresh alert badge only
  alertsCache=await apiGet('/alerts')||[];
  const badge=document.getElementById('alertBadge');
  if(badge) badge.textContent=alertsCache.filter(a=>!a.is_acknowledged).length;
  setEl('kpiAlerts', alertsCache.length);
  // If on dashboard, quietly update zone numbers in-place
  const active=document.querySelector('.section.active');
  if(active&&active.id==='section-dashboard'){
    const zones=await apiGet('/crowd/zones');
    if(zones) zones.forEach(z=>{
      const card=document.getElementById('zone-'+z.id); if(!card) return;
      const col=crowdColor(z.count), pct=Math.min(100,z.percentage);
      const ce=card.querySelector('.zone-count'); if(ce){ce.textContent=z.count.toLocaleString('en-IN');ce.style.color=col;}
      const bf=card.querySelector('.zone-bar-fill'); if(bf){bf.style.width=pct+'%';bf.style.background=col;}
      const se=card.querySelector('.zone-status'); if(se) se.textContent=`${crowdEmoji(z.count)} ${pct}% capacity`;
    });
  }
}

function changeTemple(){ showToast(`🛕 Switched to ${document.getElementById('templeSelect').options[document.getElementById('templeSelect').selectedIndex].text}`,'info'); }

function showToast(msg,type){
  const ex=document.querySelector('.toast'); if(ex) ex.remove();
  const ic={success:'✅',error:'🚨',warning:'⚠️',info:'ℹ️'}[type||'info'];
  const bc={success:'#66bb6a',error:'#ef5350',warning:'#ffd54f',info:'#4fc3f7'}[type||'info'];
  const t=document.createElement('div'); t.className='toast'; t.style.borderLeft=`4px solid ${bc}`;
  t.innerHTML=`<span style="font-size:1.2rem">${ic}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut 0.3s ease forwards';setTimeout(()=>t.remove(),300);},3200);
}

function logout(){ sessionStorage.clear(); window.location.href='index.html'; }

window.addEventListener('load',init);
