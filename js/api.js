// ── DevDarshan API Client with Offline Fallback ───────────────
// If server is running → real database. If not → time-based fallback.

const API = 'http://localhost:3000/api';

function getToken() { return sessionStorage.getItem('dd_token'); }

// ── Fallback crowd engine (runs client-side when server is offline) ──
const _HPC = [2,2,1,1,3,8,25,48,66,82,89,93,87,68,48,42,57,74,96,91,72,50,28,8];
const _DM  = [1.55,1.0,1.0,1.05,1.10,1.20,1.40];
const _FZ  = [
  {id:'main-hall',  name:'🏛️ Main Hall',      max:800,  weight:0.22},
  {id:'entry-gate', name:'🚪 Entry Gate',      max:400,  weight:0.12},
  {id:'sanctum',    name:'⛩️ Sanctum',          max:300,  weight:0.08},
  {id:'prasad',     name:'🍬 Prasad Counter',   max:250,  weight:0.10},
  {id:'north-path', name:'🧭 North Path',       max:500,  weight:0.14},
  {id:'south-path', name:'🧭 South Path',       max:450,  weight:0.12},
  {id:'parking',    name:'🅿️ Parking',           max:600,  weight:0.14},
  {id:'donation',   name:'💰 Donation Hall',    max:200,  weight:0.08}
];
const _DG = [
  {id:'G1',name:'Main Entry Gate',   type:'Primary',     capacity:500, is_open:1},
  {id:'G2',name:'North Side Gate',   type:'Secondary',   capacity:250, is_open:1},
  {id:'G3',name:'South Side Gate',   type:'Secondary',   capacity:250, is_open:1},
  {id:'G4',name:'VIP / Priority',    type:'VIP',         capacity:100, is_open:1},
  {id:'G5',name:'Staff Entry',       type:'Staff Only',  capacity:80,  is_open:1},
  {id:'G6',name:'East Wing Gate',    type:'Secondary',   capacity:200, is_open:1},
  {id:'G7',name:'Prasad Exit',       type:'Exit Only',   capacity:300, is_open:1},
  {id:'G8',name:'West Maintenance',  type:'Maintenance', capacity:50,  is_open:0},
  {id:'G9',name:'Emergency Exit',    type:'Emergency',   capacity:400, is_open:0}
];
const _AS = ['06:00–06:30','06:30–07:00','07:00–07:30','07:30–08:00',
  '08:00–08:30','08:30–09:00','09:00–09:30','09:30–10:00',
  '10:00–10:30','10:30–11:00','11:00–11:30','11:30–12:00',
  '12:00–12:30','12:30–13:00','16:00–16:30','16:30–17:00',
  '17:00–17:30','17:30–18:00','18:00–18:30','18:30–19:00'];

function _ch(h,m){ return Math.round((_HPC[h]/100)*5000*(m||1)); }
function _cm(){ return _DM[new Date().getDay()]; }
function _cc(){
  const h=new Date().getHours(),m=new Date().getMinutes(),mul=_cm();
  return Math.round(_ch(h,mul)+(_ch((h+1)%24,mul)-_ch(h,mul))*(m/60));
}
function _wt(c){ return c<500?'~5 min':c<1200?'~12 min':c<2500?'~22 min':c<3500?'~38 min':'~55 min'; }

function _fbCrowdCurrent(){
  const c=_cc(), level=c<500?'low':c<2000?'medium':'high';
  const zones={};
  _FZ.forEach(z=>{ const cnt=Math.round(c*z.weight); zones[z.id]={name:z.name,count:cnt,max:z.max,percentage:Math.min(100,Math.round((cnt/z.max)*100))}; });
  return {total:c,level,percentage:Math.round((c/5000)*100),waitTime:_wt(c),zones,timestamp:new Date().toISOString()};
}
function _fbCrowdToday(){
  const mul=_cm(); return {hourly:_HPC.map((_,h)=>_ch(h,mul)),date:new Date().toISOString().split('T')[0],dayMultiplier:mul};
}
function _fbStats(){
  const c=_cc(),h=new Date().getHours(),mul=_cm();
  let tp=0; for(let i=0;i<=h;i++) tp+=_ch(i,mul); tp=Math.round(tp/2);
  const nm=new Date().getHours()*60+new Date().getMinutes();
  const ps=Math.max(0,Math.floor((nm-360)/30));
  return {crowd:c,totalBookings:Math.min(ps*60,1800),openGates:7,totalPilgrims:tp,level:c<500?'low':c<2000?'medium':'high',waitTime:_wt(c)};
}
function _fbZones(){ return _FZ.map(z=>({...z,count:Math.round(_cc()*z.weight),percentage:Math.min(100,Math.round((Math.round(_cc()*z.weight)/z.max)*100))})); }
function _fbSlots(){
  const nowM=new Date().getHours()*60+new Date().getMinutes(), mul=_cm();
  return _AS.map(s=>{
    const[H,M]=s.split('–')[0].split(':').map(Number); const sm=H*60+M;
    const isPast=sm+30<=nowM, isCurrent=sm<=nowM&&nowM<sm+30;
    const pct=_HPC[H]/100;
    const booked=isPast?Math.round(60*Math.min(1,pct*mul)):Math.round(60*Math.min(0.8,pct*mul*0.7));
    const available=Math.max(0,60-booked);
    return {slot:s,total:80,regular:60,reserve:20,booked,available,status:isPast?'DONE':available===0?'FULL':available<=8?'ALMOST FULL':'AVAILABLE',isPast,isCurrent,isFull:available===0};
  });
}
function _fbAI(hour,dayType,weather){
  const mulMap={weekday:1.0,weekend:1.45,festival:2.4,holiday:1.85};
  let m=mulMap[dayType]||1.0;
  if(weather&&weather.includes('Rainy')) m*=0.6;
  if(weather&&weather.includes('Stormy')) m*=0.35;
  if(weather&&weather.includes('Cloudy')) m*=0.85;
  const p=_ch(hour||new Date().getHours(),m);
  return {predicted:p,level:p<500?'low':p<2000?'medium':'high',hour,dayType,weather,confidence:82,historicalSamples:0,waitTime:_wt(p)};
}
function _fbWeek(){
  const today=new Date().getDay(), days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], r=[];
  for(let i=0;i<7;i++){ const di=(today+i)%7; const pk=_ch(18,_DM[di]); r.push({dayIndex:di,label:days[di]+(i===0?' ★':''),peak:pk,level:pk<1500?'low':pk<3000?'medium':'high',offset:i}); }
  return r;
}
function _fb24h(){ const mul=_cm(), dow=new Date().getDay(); return {predictions:_HPC.map((_,h)=>_ch(h,mul)),dayType:(dow===0||dow===6)?'weekend':'weekday'}; }
function _fbAlerts(){
  const c=_cc();
  const t=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  const a=[];
  if(c>=4000) a.push({id:'dyn-1',level:'high',title:'Critical Overcrowding',description:`${c.toLocaleString('en-IN')} pilgrims – 80%+ capacity`,zone:'All Zones',is_acknowledged:0,created_at:t});
  if(c>=1200) a.push({id:'dyn-3',level:'medium',title:'Entry Gate Queue',description:`Wait: ${_wt(c)}`,zone:'Entry Gate',is_acknowledged:0,created_at:t});
  a.push({id:'offline',level:'low',title:'⚠️ Offline Mode – Start server for live DB',description:'Run: cd d:\\AKATSUKI1 && npm install && node server.js',zone:'System',is_acknowledged:0,created_at:t});
  return a;
}

// ── Fetch helpers ─────────────────────────────────────────────
function _fallback(path){
  if(path==='/crowd/current')   return _fbCrowdCurrent();
  if(path==='/crowd/today')     return _fbCrowdToday();
  if(path.startsWith('/crowd/zones')) return _fbZones();
  if(path==='/stats/today')     return _fbStats();
  // FIX: slots path may have query params (?date=...&temple=...)
  if(path.startsWith('/slots/my')){const local=JSON.parse(localStorage.getItem('dd_bookings')||'[]');return local.filter(b=>b.status!=='cancelled');}
  if(path.startsWith('/slots/all')) return [];
  if(path.startsWith('/slots'))    return _fbSlots();
  if(path==='/gates')           return JSON.parse(localStorage.getItem('dd_gates')||JSON.stringify(_DG));
  if(path==='/ai/today24h')     return _fb24h();
  if(path==='/ai/week')         return _fbWeek();
  if(path==='/alerts')          return _fbAlerts();
  if(path.startsWith('/ai/predict')){
    const p=new URLSearchParams((path.split('?')[1])||'');
    return _fbAI(parseInt(p.get('hour')||new Date().getHours()),p.get('dayType')||'weekday',p.get('weather')||'sunny');
  }
  return null;
}

async function apiGet(path){
  const token=getToken();
  try{
    const ctrl=new AbortController(); const tid=setTimeout(()=>ctrl.abort(),3000);
    const res=await fetch(API+path,{signal:ctrl.signal,headers:token?{Authorization:'Bearer '+token}:{}});
    clearTimeout(tid);
    if(res.status===401){sessionStorage.clear();window.location.href='index.html';return _fallback(path);}
    return await res.json();
  }catch(e){ return _fallback(path); }
}

async function apiPost(path,body){
  const token=getToken();
  try{
    const ctrl=new AbortController(); const tid=setTimeout(()=>ctrl.abort(),3000);
    const res=await fetch(API+path,{method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    clearTimeout(tid);
    return await res.json();
  }catch(e){
    if(path==='/slots/book'){
      const tok='T'+Date.now().toString().slice(-5);
      const bks=JSON.parse(localStorage.getItem('dd_bookings')||'[]');
      const b={...body,id:Date.now().toString(),token:tok,status:'upcoming',is_reserve:0,created_at:new Date().toISOString()};
      bks.push(b); localStorage.setItem('dd_bookings',JSON.stringify(bks));
      return b;
    }
    return null;
  }
}

async function apiPut(path,body){
  const token=getToken();
  try{
    const res=await fetch(API+path,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    return await res.json();
  }catch(e){
    // For gates, persist toggle locally
    if(path.startsWith('/gates')){
      const gates=JSON.parse(localStorage.getItem('dd_gates')||JSON.stringify(_DG));
      const id=path.split('/').pop();
      if(id&&id!=='gates') { const g=gates.find(g=>g.id===id); if(g) g.is_open=body.is_open?1:0; }
      else gates.forEach(g=>g.is_open=body.is_open?1:0);
      localStorage.setItem('dd_gates',JSON.stringify(gates));
    }
    return {success:true};
  }
}

async function apiDelete(path){
  const token=getToken();
  try{
    const res=await fetch(API+path,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
    return await res.json();
  }catch(e){
    if(path.startsWith('/slots/')){
      const id=path.split('/').pop();
      const bks=JSON.parse(localStorage.getItem('dd_bookings')||'[]');
      const updated=bks.map(b=>b.id===id?{...b,status:'cancelled'}:b);
      localStorage.setItem('dd_bookings',JSON.stringify(updated));
    }
    return {success:true};
  }
}
