// ===== DEVOTEE DASHBOARD – API-CONNECTED =====
// Depends on: api.js (loaded before this file)

const TEMPLE_NAMES={somnath:'Somnath Temple',dwarkadhish:'Dwarkadhish Temple',ambaji:'Ambaji Temple',pavagadh:'Pavagadh Temple'};
let myBookings=[], selectedTemple='somnath', selectedSlot=null, devoteeCount=1, currentStep=1, charts={};

function setEl(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function crowdColor(c){ return c<500?'#66bb6a':c<2000?'#ffd54f':'#ef5350'; }
function crowdEmoji(c){ return c<500?'🟢':c<2000?'🟡':'🔴'; }
function crowdLabel(c){ return c<500?'LOW':c<2000?'MEDIUM':'HIGH'; }

// ── INIT ──────────────────────────────────────────────────────
async function init(){
  updateClock(); setInterval(updateClock,1000);
  setInterval(liveMinuteTick,60000);

  // Show user name
  const nm=sessionStorage.getItem('dd_name')||'Devotee';
  setEl('devoteeDisplayName',nm);

  const today=new Date().toISOString().split('T')[0];
  ['visitDate','prDate'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=today; });

  await refreshHomeStats();
  await initHomeChart();
  await loadMyBookings();
}

function updateClock(){
  const el=document.getElementById('liveClock');
  if(el) el.textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
}

// ── HOME STATS ────────────────────────────────────────────────
async function refreshHomeStats(){
  const data=await apiGet('/crowd/current'); if(!data) return;
  const c=data.total; const col=crowdColor(c);

  setEl('hcTemple', TEMPLE_NAMES[selectedTemple]);
  setEl('hcSlotsLeft', (await apiGet('/slots')||[]).filter(s=>!s.isPast&&s.available>0).length);
  setEl('qsWait', data.waitTime);

  const stats=await apiGet('/stats/today');
  if(stats) setEl('qsPilgrims',stats.totalPilgrims.toLocaleString('en-IN'));

  const qsCrowdEl=document.querySelector('.qs-val.qs-green');
  if(qsCrowdEl){qsCrowdEl.textContent=`${crowdEmoji(c)} ${crowdLabel(c)}`;qsCrowdEl.style.color=col;}

  const dot=document.querySelector('#hcStatus .hcs-dot');
  if(dot) dot.style.background=col;
  const waitEl=document.querySelector('#hcStatus .hcs-item:nth-child(2)');
  if(waitEl) waitEl.innerHTML=`⏱️ Avg Wait: <strong>${data.waitTime}</strong>`;

  updateGlobalCrowdPill(c);
}

function updateGlobalCrowdPill(c){
  const pill=document.getElementById('globalCrowdPill'); if(!pill) return;
  const col=crowdColor(c);
  pill.textContent=`${crowdEmoji(c)} ${crowdLabel(c)}`;
  pill.style.cssText=`background:${col}22;color:${col};border:1px solid ${col}55;padding:6px 14px;border-radius:100px;font-size:0.8rem;font-weight:700`;
}

async function updateBookingBadge(){
  const cnt=myBookings.filter(b=>b.status==='upcoming').length;
  const badge=document.getElementById('bookingBadge');
  if(badge){badge.textContent=cnt;badge.style.display=cnt>0?'block':'none';}
  setEl('qsMySlots',cnt);
}

// ── HOME CHART ────────────────────────────────────────────────
async function initHomeChart(){
  const ctx=document.getElementById('homeChartCanvas'); if(!ctx) return;
  const data=await apiGet('/crowd/today'); if(!data) return;
  const now=new Date().getHours();
  const cols=data.hourly.map((v,i)=>i===now?'#ff6b35':crowdColor(v)+'aa');
  if(charts.home){
    charts.home.data.datasets[0].data=data.hourly;
    charts.home.data.datasets[0].backgroundColor=cols;
    charts.home.update('none'); return;
  }
  charts.home=new Chart(ctx,{
    type:'bar',
    data:{labels:data.hourly.map((_,i)=>`${String(i).padStart(2,'0')}:00`),datasets:[{label:'Crowd',data:data.hourly,backgroundColor:cols,borderRadius:4,borderWidth:0}]},
    options:{responsive:true, maintainAspectRatio:true, aspectRatio:3,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(18,11,26,0.95)',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#fdf4ff',bodyColor:'rgba(253,244,255,0.7)',callbacks:{label:c=>`${crowdEmoji(c.raw)} ${c.raw.toLocaleString('en-IN')} pilgrims`}}},
      scales:{x:{grid:{display:false},ticks:{color:'rgba(253,244,255,0.4)',maxTicksLimit:8}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(253,244,255,0.4)'},beginAtZero:true}}}
  });
}

// ── CROWD STATUS ─────────────────────────────────────────────
async function initCrowdStatusSection(){
  const [current,today]=await Promise.all([apiGet('/crowd/current'),apiGet('/crowd/today')]);
  if(!current) return;
  const c=current.total,col=crowdColor(c);
  setEl('cldEmoji',crowdEmoji(c));
  const lvlEl=document.getElementById('cldLevel');
  if(lvlEl){lvlEl.textContent=`${crowdLabel(c)} CROWD`;lvlEl.style.color=col;}
  setEl('cldCount',`~${c.toLocaleString('en-IN')} pilgrims currently`);
  setEl('csWait',current.waitTime);
  setEl('csCap',`${current.percentage}%`);
  const sl=(await apiGet('/slots')||[]).filter(s=>!s.isPast&&s.available>0).length;
  setEl('csSlots',sl);
  updateGlobalCrowdPill(c);
  renderZoneMiniList(current.zones);
  if(today) renderHourlyCrowd(today.hourly);
  renderCrowdStatusChart(today?.hourly||[]);
}

function renderCrowdStatusChart(hourly){
  const ctx=document.getElementById('crowdStatusChart'); if(!ctx) return;
  const now=new Date().getHours();
  if(charts.crowdStatus){
    charts.crowdStatus.data.datasets[0].data=hourly;
    charts.crowdStatus.update('none'); return;
  }
  charts.crowdStatus=new Chart(ctx,{
    type:'line',
    data:{labels:hourly.map((_,i)=>`${String(i).padStart(2,'0')}:00`),datasets:[{label:'Pilgrims',data:hourly,fill:true,borderColor:'#ce93d8',backgroundColor:'rgba(206,147,216,0.07)',tension:0.4,borderWidth:2.5,pointRadius:(c)=>c.dataIndex===now?7:0,pointBackgroundColor:'#ff6b35',pointBorderColor:'#fff',pointBorderWidth:2}]},
    options:{responsive:true, maintainAspectRatio:true, aspectRatio:2.8,
      plugins:{legend:{display:false},tooltip:{mode:'index',intersect:false,backgroundColor:'rgba(18,11,26,0.95)',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#fdf4ff',bodyColor:'rgba(253,244,255,0.7)'}},
      scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(253,244,255,0.4)',maxTicksLimit:8}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(253,244,255,0.4)'},beginAtZero:true}}}
  });
}

function renderZoneMiniList(zones){
  const ctr=document.getElementById('zoneMiniList'); if(!ctr||!zones) return;
  ctr.innerHTML='';
  Object.entries(zones).forEach(([id,z])=>{
    const col=crowdColor(z.count);
    const div=document.createElement('div'); div.className='zml-item';
    div.innerHTML=`<div class="zml-name">${z.name}</div><div class="zml-bar"><div class="zml-bar-fill" style="width:${Math.min(100,z.percentage)}%;background:${col}"></div></div><div class="zml-pct" style="color:${col}">${z.percentage}%</div>`;
    ctr.appendChild(div);
  });
}

function renderHourlyCrowd(hourly){
  const ctr=document.getElementById('hourlyCrowd'); if(!ctr) return;
  ctr.innerHTML='';
  const now=new Date().getHours(), maxV=Math.max(...hourly)||1;
  hourly.forEach((count,i)=>{
    const h=Math.max(4,Math.round((count/maxV)*60)), col=crowdColor(count);
    const div=document.createElement('div'); div.className=`hc-hour${i===now?' hc-now':''}`;
    div.innerHTML=`${i===now?'<div class="hc-now-badge">NOW</div>':''}<div class="hc-bar" style="height:${h}px;background:${col}"></div><div class="hc-label">${String(i).padStart(2,'0')}h</div><div class="hc-count" style="color:${col}">${count>=1000?(count/1000).toFixed(1)+'k':count}</div>`;
    ctr.appendChild(div);
  });
}

// ── BOOKING ───────────────────────────────────────────────────
function selectTemple(el,temple){
  document.querySelectorAll('.tcm-card').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); selectedTemple=temple;
  const sel=document.getElementById('templeSelect'); if(sel) sel.value=temple;
}
function changeCount(d){ devoteeCount=Math.max(1,Math.min(10,devoteeCount+d)); setEl('devoteeCount',devoteeCount); }

async function goToStep(step){
  if(step===2){
    const date=document.getElementById('visitDate').value;
    if(!date){showToast('Please select a date','warning');return;}
    await renderAvailabilityChart();
  }
  if(step===3){
    if(!selectedSlot){showToast('Please select a time slot','warning');return;}
    renderConfirmSummary();
  }
  for(let i=1;i<=4;i++){
    const ind=document.getElementById(`step${i}ind`), cont=document.getElementById(`step-${i}`);
    if(ind){ind.className='step';if(i<step) ind.classList.add('done');else if(i===step) ind.classList.add('active');}
    if(cont){cont.className='step-content';if(i===step) cont.classList.add('active');}
  }
  currentStep=step;
}

async function renderAvailabilityChart(){
  const ctr=document.getElementById('availabilityChart'); if(!ctr) return;
  ctr.innerHTML='<div style="padding:20px;color:rgba(253,244,255,0.5)">⏳ Loading slots…</div>';
  selectedSlot=null;
  const nb=document.getElementById('step2Next'); if(nb) nb.disabled=true;
  const date=document.getElementById('visitDate').value;
  const slots=await apiGet(`/slots?date=${date}&temple=${selectedTemple}`)||[];
  ctr.innerHTML='';
  slots.forEach(s=>{
    const isFull=s.isFull, isAlmost=!isFull&&s.available<=8;
    let cls='avail-slot ';
    let statusText='',statusColor='';
    if(s.isPast)       {cls+='slot-full';statusText='✔ Done';statusColor='#666';}
    else if(isFull)    {cls+='slot-reserve';statusText='💜 Reserve';statusColor='#ce93d8';}
    else if(isAlmost)  {cls+='slot-almost';statusText=`⚡ ${s.available} left`;statusColor='#ffd54f';}
    else               {cls+='slot-available';statusText=`✅ ${s.available} left`;statusColor='#66bb6a';}
    const div=document.createElement('div'); div.className=cls+(s.isCurrent?' slot-current':'');
    div.innerHTML=`<div class="as-time">${s.slot}</div><div class="as-count" style="color:rgba(253,244,255,0.5)">Cap: ${s.total}</div><div class="as-status" style="color:${statusColor}">${statusText}</div>`;
    if(!s.isPast) div.onclick=()=>selectSlot(div,s.slot,s.available,s.reserve,s.isFull);
    else div.style.cursor='not-allowed';
    ctr.appendChild(div);
  });
}

function selectSlot(el,slot,available,reserve,isFull){
  document.querySelectorAll('.avail-slot').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected'); selectedSlot={slot,available,reserve,isFull};
  const info=document.getElementById('selectedSlotInfo'), cont=document.getElementById('ssiContent'), nb=document.getElementById('step2Next');
  if(info) info.style.display='block';
  if(cont) cont.innerHTML=`<div style="margin-bottom:8px"><strong>⏰ Slot:</strong> ${slot}</div><div style="margin-bottom:8px"><strong>🎟️ Type:</strong> ${isFull?'💜 Reserve Slot (25% buffer)':'✅ Regular Slot'}</div><div style="margin-bottom:8px"><strong>🛕 Temple:</strong> ${TEMPLE_NAMES[selectedTemple]}</div><div style="opacity:0.7;font-size:0.82rem">ℹ️ Missed slot? Reserve (25%) activates automatically.</div>`;
  if(nb) nb.disabled=false;
}

function renderConfirmSummary(){
  const ctr=document.getElementById('confirmSummary'); if(!ctr) return;
  const date=document.getElementById('visitDate').value;
  const cat=document.getElementById('specialCat').value;
  ctr.innerHTML=`
    <div class="cs-row"><span class="cs-label">Temple</span><span class="cs-val">🛕 ${TEMPLE_NAMES[selectedTemple]}</span></div>
    <div class="cs-row"><span class="cs-label">Date</span><span class="cs-val">📅 ${date}</span></div>
    <div class="cs-row"><span class="cs-label">Slot</span><span class="cs-val">⏰ ${selectedSlot.slot}</span></div>
    <div class="cs-row"><span class="cs-label">Devotees</span><span class="cs-val">👥 ${devoteeCount}</span></div>
    ${cat?`<div class="cs-row"><span class="cs-label">Category</span><span class="cs-val">⭐ ${cat}</span></div>`:''}
    <div class="cs-row"><span class="cs-label">Type</span><span class="cs-val">${selectedSlot.isFull?'💜 Reserve':'✅ Regular'}</span></div>
    <div class="cs-row" style="background:rgba(206,147,216,0.06);border-radius:8px;padding:10px 12px;border:none"><span style="font-size:0.82rem;color:rgba(253,244,255,0.6)">ℹ️ 25% reserve buffer auto-activates if you miss.</span></div>`;
}

async function confirmBooking(){
  const date=document.getElementById('visitDate').value;
  const cat=document.getElementById('specialCat').value;
  const result=await apiPost('/slots/book',{temple_id:selectedTemple,slot_time:selectedSlot.slot,booking_date:date,people:devoteeCount,special_category:cat||null});
  if(!result||result.error){showToast('❌ '+(result?.error||'Booking failed'),'error');return;}
  myBookings.unshift({...result,temple:TEMPLE_NAMES[selectedTemple]});
  await updateBookingBadge();
  goToStep(4);
  renderTokenCard({...result,temple:TEMPLE_NAMES[selectedTemple]});
  showToast(`🎟️ Confirmed! Token: ${result.token}`,'success');
}

function renderTokenCard(b){
  const card=document.getElementById('tokenCard'); if(!card) return;
  card.innerHTML=`
    <div class="tc-temple">🛕 DARSHAN TOKEN</div>
    <div class="tc-temple-name">${b.temple}</div>
    <div class="tc-qr">🎫</div>
    <div class="tc-token">${b.token}</div>
    <div class="tc-slot">⏰ ${b.slot_time}</div>
    <div class="tc-people">👥 ${b.people} devotee${b.people>1?'s':''} &nbsp;|&nbsp; 📅 ${b.booking_date}</div>
    <div class="tc-reserve">${b.is_reserve?'💜 Reserve slot – 25% buffer used':'ℹ️ 25% reserve backup covers missed slots'}</div>`;
}

function downloadToken(){ showToast('📥 Token saved!','success'); }
function resetBooking(){ selectedSlot=null;devoteeCount=1;setEl('devoteeCount','1');goToStep(1); }

// ── MY BOOKINGS ───────────────────────────────────────────────
async function loadMyBookings(){
  const rows=await apiGet('/slots/my')||[];
  myBookings=rows;
  await updateBookingBadge();
}

async function renderMyBookings(){
  await loadMyBookings();
  const list=document.getElementById('bookingsList'), empty=document.getElementById('bookingsEmpty');
  if(!list) return;
  if(!myBookings.length){if(empty) empty.style.display='block';list.innerHTML='';return;}
  if(empty) empty.style.display='none';
  list.innerHTML='';
  myBookings.forEach(b=>{
    const div=document.createElement('div'); div.className='booking-item';
    div.innerHTML=`
      <div class="bi-token">${b.token}</div>
      <div class="bi-details">
        <div class="bi-temple">🛕 ${TEMPLE_NAMES[b.temple_id]||b.temple_id}</div>
        <div class="bi-slot">⏰ ${b.slot_time} &nbsp;|&nbsp; 📅 ${b.booking_date}</div>
        <div class="bi-meta">👥 ${b.people} ${b.is_reserve?'&nbsp;|&nbsp; 💜 Reserve':''}</div>
      </div>
      <div class="bi-status bi-${b.status}">${b.status==='upcoming'?'🟡 Upcoming':'✅ Completed'}</div>
      ${b.status==='upcoming'?`<button class="bi-cancel-btn" onclick="cancelBooking('${b.id}')">✕ Cancel</button>`:''}`;
    list.appendChild(div);
  });
}

async function cancelBooking(id){
  await apiDelete(`/slots/${id}`);
  showToast('Booking cancelled','warning');
  await renderMyBookings();
}

// ── VIRTUAL QUEUE ─────────────────────────────────────────────
async function initVirtualQueue(){
  const data=await apiGet('/crowd/current')||{total:0};
  const c=data.total;
  const ahead=Math.round((c/5000)*120);
  const wt=Math.ceil(ahead*0.5);
  const pct=Math.min(100,Math.round((ahead/120)*100));
  setEl('vqAhead',ahead); setEl('vqWait',`~${wt} min`);
  const myTok=myBookings.length>0?myBookings[0].token:'—';
  setEl('vqToken',myTok);
  const bar=document.getElementById('vqMeterBar'); if(bar) bar.style.width=`${pct}%`;
  const em=document.getElementById('crowdEmojiDisplay'); if(em) em.textContent=crowdEmoji(c);
}

async function joinQueue(){
  const time=document.getElementById('vqTimeSelect').value;
  const phone=document.getElementById('vqPhone').value;
  const data=await apiGet('/crowd/current')||{total:0};
  const c=data.total;
  const ahead=Math.round((c/5000)*120);
  const wt=Math.ceil(ahead*0.5);
  const tok=`Q${String(Date.now()).slice(-5)}`;
  document.getElementById('vqJoinPanel').style.display='none';
  const qtd=document.getElementById('queueTokenDisplay'); qtd.style.display='block';
  document.getElementById('qtdCard').innerHTML=`
    <div class="qtd-label">🎫 YOUR VIRTUAL QUEUE TOKEN</div>
    <div class="qtd-token">${tok}</div>
    <div class="qtd-slot">⏰ Your slot: ${time}</div>
    <div class="qtd-ahead">👥 People ahead: <strong>${ahead}</strong></div>
    <div class="qtd-wait">⏱️ Estimated wait: ~${wt} minutes</div>
    ${phone?`<div style="font-size:0.78rem;color:rgba(253,244,255,0.5);margin-top:8px">📱 SMS queued for ${phone}</div>`:''}`;
  setEl('vqToken',tok);
  showToast(`🎫 Token ${tok}! ${ahead} ahead, ~${wt} min`,'success');
}

function cancelQueueToken(){
  document.getElementById('queueTokenDisplay').style.display='none';
  document.getElementById('vqJoinPanel').style.display='block';
  setEl('vqToken','—');
  showToast('Queue token cancelled','warning');
}

// ── AI BEST TIMES ─────────────────────────────────────────────
async function initBestTimesSection(){
  await renderBestTimesGrid();
  await renderWeekPrediction();
  await renderBestHoursChart();
  await renderAITips();
}

async function renderBestTimesGrid(){
  const ctr=document.getElementById('bestTimesGrid'); if(!ctr) return;
  ctr.innerHTML='<div style="color:rgba(253,244,255,0.5);padding:20px">⏳ Loading AI analysis…</div>';
  const slots=[
    {time:'6–7 AM',hour:6,emoji:'🌅'},{time:'7–9 AM',hour:7,emoji:'🌤️'},
    {time:'9–11 AM',hour:9,emoji:'☀️'},{time:'11–2 PM',hour:11,emoji:'🔥'},
    {time:'2–4 PM',hour:14,emoji:'⛅'},{time:'6–7 PM',hour:18,emoji:'🌆'},
    {time:'7–9 PM',hour:19,emoji:'🌙'}
  ];
  const preds=await Promise.all(slots.map(s=>apiGet(`/ai/predict?hour=${s.hour}`)));
  ctr.innerHTML='';
  slots.forEach((s,i)=>{
    const p=preds[i]; if(!p) return;
    const col=crowdColor(p.predicted);
    const tag=p.predicted<500?'BEST':p.predicted<1200?'GOOD':p.predicted<2500?'MODERATE':'AVOID';
    const cls=p.predicted<500?'best':p.predicted<1200?'good':p.predicted<2500?'busy':'worst';
    const bCls=p.predicted<500?'badge-best':p.predicted<1200?'badge-good':p.predicted<2500?'badge-busy':'badge-worst';
    const div=document.createElement('div'); div.className=`bt-card ${cls}`;
    div.innerHTML=`<span class="bt-emoji">${s.emoji}</span><div class="bt-time">${s.time}</div><div class="bt-crowd" style="color:${col}">~${p.predicted.toLocaleString('en-IN')}</div><div class="bt-desc">${p.confidence}% confidence (${p.historicalSamples} records)</div><span class="bt-badge ${bCls}">${tag}</span>`;
    ctr.appendChild(div);
  });
}

async function renderWeekPrediction(){
  const ctr=document.getElementById('weekPred'); if(!ctr) return;
  const forecast=await apiGet('/ai/week')||[];
  ctr.innerHTML='';
  forecast.forEach((day,i)=>{
    const em=day.level==='low'?'🟢':day.level==='medium'?'🟡':'🔴';
    const div=document.createElement('div'); div.className=`wp-day${i===0?' today':''}`;
    div.innerHTML=`<div class="wp-day-name">${day.label}</div><span class="wp-emoji">${em}</span><div class="wp-count">~${day.peak.toLocaleString('en-IN')}</div>`;
    ctr.appendChild(div);
  });
}

async function renderBestHoursChart(){
  const ctx=document.getElementById('bestHoursChart'); if(!ctx) return;
  const data=await apiGet('/ai/today24h'); if(!data) return;
  if(charts.bestHours){
    charts.bestHours.data.datasets[0].data=data.predictions;
    charts.bestHours.update('none'); return;
  }
  charts.bestHours=new Chart(ctx,{
    type:'bar',
    data:{labels:data.predictions.map((_,i)=>`${String(i).padStart(2,'0')}h`),datasets:[{label:'Predicted Crowd',data:data.predictions,backgroundColor:data.predictions.map(v=>crowdColor(v)+'aa'),borderRadius:4}]},
    options:{responsive:true, maintainAspectRatio:true, aspectRatio:3,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(18,11,26,0.95)',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#fdf4ff',bodyColor:'rgba(253,244,255,0.7)',callbacks:{label:c=>`${crowdEmoji(c.raw)} ${c.raw.toLocaleString('en-IN')}`}}},
      scales:{x:{grid:{display:false},ticks:{color:'rgba(253,244,255,0.4)',maxTicksLimit:12}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(253,244,255,0.4)'},beginAtZero:true}}}
  });
}

async function renderAITips(){
  const ctr=document.getElementById('aiTips'); if(!ctr) return;
  const current=await apiGet('/crowd/current')||{total:0,waitTime:'—',level:'low'};
  const c=current.total;
  const tips=[
    {icon:'🕐',text:`Right now: <strong>${crowdEmoji(c)} ${crowdLabel(c)}</strong> (${c.toLocaleString('en-IN')} pilgrims) · Wait: ${current.waitTime}. ${c<500?'🎉 Great time to visit!':c<2000?'Manageable – proceed with token.':'Consider visiting before 7 AM or after 9 PM.'}`},
    {icon:'📅',text:`<strong>This ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]}:</strong> AI predicts ${new Date().getDay()===0||new Date().getDay()===6?'⚠️ higher traffic':'✅ normal traffic'} based on 90-day history`},
    {icon:'🎟️',text:'Book slots <strong>24–48 hours in advance</strong> — availability shown is real-time from database'},
    {icon:'♿',text:'Priority access for elderly, disabled, pregnant is <strong>always available</strong> regardless of crowd'},
    {icon:'📲',text:'Get your <strong>virtual queue token</strong> before leaving home to skip physical queues'}
  ];
  ctr.innerHTML='';
  tips.forEach(t=>{
    const div=document.createElement('div'); div.className='ai-tip-item';
    div.innerHTML=`<span>${t.icon}</span><span>${t.text}</span>`;
    ctr.appendChild(div);
  });
}

// ── PRIORITY ACCESS ───────────────────────────────────────────
function requestPriority(type){
  const panel=document.getElementById('priorityBookingPanel'), cat=document.getElementById('priorityCategory');
  const names={disabled:'♿ Differently-Abled',senior:'👴 Senior Citizen',pregnant:'🤰 Pregnant Woman',child:'👶 With Infant'};
  if(cat) cat.textContent=names[type]||type;
  if(panel){panel.style.display='block';panel.scrollIntoView({behavior:'smooth'});}
}
function submitPriority(){
  const name=document.getElementById('prName').value;
  if(!name){showToast('Please enter your name','warning');return;}
  showToast(`✅ Priority request submitted for ${name}!`,'success');
  document.getElementById('priorityBookingPanel').style.display='none';
}

// ── SECTION NAV ───────────────────────────────────────────────
const TITLES={home:'Welcome to DevDarshan',booking:'Book Darshan Slot',mySlots:'My Bookings',crowdStatus:'Live Crowd Status',virtualQueue:'Virtual Queue',aiPrediction:'AI – Best Time to Visit',priority:'Priority Access',routing:'Safe Routing Guide'};

async function showSection(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');
  setEl('pageTitle',TITLES[name]||name);
  if(name==='crowdStatus')  await initCrowdStatusSection();
  else if(name==='mySlots') await renderMyBookings();
  else if(name==='virtualQueue') await initVirtualQueue();
  else if(name==='aiPrediction') await initBestTimesSection();
  if(window.innerWidth<900) document.getElementById('sidebar')?.classList.remove('mobile-open');
}

function toggleSidebar(){
  const sb=document.getElementById('sidebar'),mc=document.querySelector('.main-content');
  if(window.innerWidth<900) sb.classList.toggle('mobile-open');
  else{sb.classList.toggle('collapsed');mc?.classList.toggle('full');}
}

async function liveMinuteTick(){
  // Only update crowd pill + wait — never touch chart sections (causes blink)
  const data=await apiGet('/crowd/current'); if(!data) return;
  const c=data.total, col=crowdColor(c);
  updateGlobalCrowdPill(c);
  setEl('qsWait', data.waitTime);
  const qsEl=document.querySelector('.qs-val.qs-green');
  if(qsEl){qsEl.textContent=`${crowdEmoji(c)} ${crowdLabel(c)}`;qsEl.style.color=col;}
  const dot=document.querySelector('#hcStatus .hcs-dot');
  if(dot) dot.style.background=col;
}

function changeTemple(){
  selectedTemple=document.getElementById('templeSelect').value;
  setEl('hcTemple',TEMPLE_NAMES[selectedTemple]);
  setEl('chartTempleName',TEMPLE_NAMES[selectedTemple]);
  showToast(`🛕 Switched to ${TEMPLE_NAMES[selectedTemple]}`,'info');
}

function showToast(msg,type){
  const ex=document.querySelector('.toast'); if(ex) ex.remove();
  const ic={success:'✅',error:'🚨',warning:'⚠️',info:'ℹ️'}[type||'info'];
  const bc={success:'#66bb6a',error:'#ef5350',warning:'#ffd54f',info:'#ce93d8'}[type||'info'];
  const t=document.createElement('div'); t.className='toast'; t.style.borderLeft=`4px solid ${bc}`;
  t.innerHTML=`<span style="font-size:1.2rem">${ic}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut 0.3s ease forwards';setTimeout(()=>t.remove(),300);},3200);
}

function logout(){ sessionStorage.clear(); window.location.href='index.html'; }

window.addEventListener('load',init);
