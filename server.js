// ============================================================
//  DevDarshan – Express + SQLite Backend
//  Run: node server.js  →  open http://localhost:3000
// ============================================================
const express  = require('express');
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const { v4: uuidv4 } = require('uuid');
const path     = require('path');
const fs       = require('fs');

const app        = express();
const JWT_SECRET = 'devdarshan_jwt_secret_2024';
const PORT       = 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));   // serve frontend

// ── Database ──────────────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'db'))) fs.mkdirSync(path.join(__dirname, 'db'));
const db = new Database(path.join(__dirname, 'db', 'devdarshan.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'devotee',
  name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS slot_bookings (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  temple_id TEXT NOT NULL DEFAULT 'somnath',
  slot_time TEXT NOT NULL, booking_date TEXT NOT NULL,
  people INTEGER NOT NULL DEFAULT 1, token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  is_reserve INTEGER DEFAULT 0, special_category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS historical_crowd (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, hour INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL, crowd_count INTEGER NOT NULL,
  is_weekend INTEGER DEFAULT 0, is_festival INTEGER DEFAULT 0,
  weather TEXT DEFAULT 'sunny', temple_id TEXT DEFAULT 'somnath',
  UNIQUE(date, hour, temple_id)
);
CREATE TABLE IF NOT EXISTS gate_status (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
  capacity INTEGER NOT NULL, is_open INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, level TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT, zone TEXT,
  is_acknowledged INTEGER DEFAULT 0, is_resolved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// ── Crowd math (server-side) ──────────────────────────────────
const HOURLY_PCT = [2,2,1,1,3,8,25,48,66,82,89,93,87,68,48,42,57,74,96,91,72,50,28,8];
const DAY_MUL    = [1.55,1.00,1.00,1.05,1.10,1.20,1.40];
const ZONES = [
  { id:'main-hall',  name:'🏛️ Main Hall',      max:800,  weight:0.22 },
  { id:'entry-gate', name:'🚪 Entry Gate',      max:400,  weight:0.12 },
  { id:'sanctum',    name:'⛩️ Sanctum',          max:300,  weight:0.08 },
  { id:'prasad',     name:'🍬 Prasad Counter',   max:250,  weight:0.10 },
  { id:'north-path', name:'🧭 North Path',       max:500,  weight:0.14 },
  { id:'south-path', name:'🧭 South Path',       max:450,  weight:0.12 },
  { id:'parking',    name:'🅿️ Parking',           max:600,  weight:0.14 },
  { id:'donation',   name:'💰 Donation Hall',    max:200,  weight:0.08 }
];

function crowdAtHour(h, mul) { return Math.round((HOURLY_PCT[h]/100)*5000*(mul||1)); }
function currentMul()  { return DAY_MUL[new Date().getDay()]; }
function getCurrentCrowd() {
  const h=new Date().getHours(), m=new Date().getMinutes(), mul=currentMul();
  return Math.round(crowdAtHour(h,mul) + (crowdAtHour((h+1)%24,mul)-crowdAtHour(h,mul))*(m/60));
}
function waitTime(c) { return c<500?'~5 min':c<1200?'~12 min':c<2500?'~22 min':c<3500?'~38 min':'~55 min'; }

// ── Seed data ────────────────────────────────────────────────
(function seed() {
  // Default accounts
  if (!db.prepare('SELECT id FROM users WHERE username=?').get('admin')) {
    db.prepare('INSERT INTO users(id,username,password_hash,role,name) VALUES(?,?,?,?,?)')
      .run(uuidv4(),'admin',bcrypt.hashSync('admin123',10),'security','Security Admin');
  }
  if (!db.prepare('SELECT id FROM users WHERE username=?').get('devotee')) {
    db.prepare('INSERT INTO users(id,username,password_hash,role,name) VALUES(?,?,?,?,?)')
      .run(uuidv4(),'devotee',bcrypt.hashSync('dev123',10),'devotee','Demo Devotee');
  }

  // Gates
  if (!db.prepare('SELECT COUNT(*) as c FROM gate_status').get().c) {
    const gs = [
      {id:'G1',name:'Main Entry Gate',   type:'Primary',     cap:500, open:1},
      {id:'G2',name:'North Side Gate',   type:'Secondary',   cap:250, open:1},
      {id:'G3',name:'South Side Gate',   type:'Secondary',   cap:250, open:1},
      {id:'G4',name:'VIP / Priority',    type:'VIP',         cap:100, open:1},
      {id:'G5',name:'Staff Entry',       type:'Staff Only',  cap:80,  open:1},
      {id:'G6',name:'East Wing Gate',    type:'Secondary',   cap:200, open:1},
      {id:'G7',name:'Prasad Exit',       type:'Exit Only',   cap:300, open:1},
      {id:'G8',name:'West Maintenance',  type:'Maintenance', cap:50,  open:0},
      {id:'G9',name:'Emergency Exit',    type:'Emergency',   cap:400, open:0}
    ];
    const st = db.prepare('INSERT INTO gate_status(id,name,type,capacity,is_open) VALUES(?,?,?,?,?)');
    gs.forEach(g => st.run(g.id,g.name,g.type,g.cap,g.open));
  }

  // Historical crowd – seed 90 days (real source for AI)
  const histCount = db.prepare('SELECT COUNT(*) as c FROM historical_crowd').get().c;
  if (histCount < 2000) {
    console.log('📊 Seeding 90 days of historical crowd data for AI…');
    const st = db.prepare(
      'INSERT OR IGNORE INTO historical_crowd(date,hour,day_of_week,crowd_count,is_weekend,is_festival,weather,temple_id) VALUES(?,?,?,?,?,?,?,?)'
    );
    const weathers = ['sunny','sunny','sunny','cloudy','rainy'];
    const tx = db.transaction(() => {
      for (let ago=90; ago>=1; ago--) {
        const d   = new Date(); d.setDate(d.getDate()-ago);
        const ds  = d.toISOString().split('T')[0];
        const dow = d.getDay();
        const mul = DAY_MUL[dow];
        const isW = (dow===0||dow===6) ? 1 : 0;
        const isF = (Math.abs(ago*31+ago*7)%20)===0 ? 1 : 0; // ~5% festival
        const wea = weathers[(ago*17+3)%weathers.length];
        const wMul= wea==='rainy'?0.6:wea==='cloudy'?0.85:1.0;
        for (let h=0; h<24; h++) {
          const noise = 0.88 + (((ago*17+h*7)%25)/100); // deterministic variation
          const cnt = Math.round(crowdAtHour(h, mul*(isF?2.2:1.0)*wMul)*noise);
          st.run(ds,h,dow,cnt,isW,isF,wea,'somnath');
        }
      }
    });
    tx();
    console.log('✅ Historical data ready');
  }
})();

// ── Auth middleware ───────────────────────────────────────────
function auth(req,res,next) {
  const t = req.headers.authorization?.split(' ')[1];
  if (!t) return res.status(401).json({error:'No token'});
  try { req.user=jwt.verify(t,JWT_SECRET); next(); }
  catch { res.status(401).json({error:'Invalid token'}); }
}
function secOnly(req,res,next) {
  if(req.user.role!=='security') return res.status(403).json({error:'Security only'});
  next();
}

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
app.post('/api/auth/login',(req,res)=>{
  const {username,password}=req.body;
  const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if(!user||!bcrypt.compareSync(password,user.password_hash))
    return res.status(401).json({error:'Invalid credentials'});
  const token=jwt.sign({id:user.id,username:user.username,role:user.role,name:user.name},JWT_SECRET,{expiresIn:'24h'});
  res.json({token,role:user.role,username:user.username,name:user.name});
});

app.post('/api/auth/register',(req,res)=>{
  const {username,password,name}=req.body;
  if(!username||!password) return res.status(400).json({error:'Username and password required'});
  try {
    const id=uuidv4();
    db.prepare('INSERT INTO users(id,username,password_hash,role,name) VALUES(?,?,?,?,?)')
      .run(id,username,bcrypt.hashSync(password,10),'devotee',name||username);
    const token=jwt.sign({id,username,role:'devotee',name:name||username},JWT_SECRET,{expiresIn:'24h'});
    res.json({token,role:'devotee',username,name:name||username});
  } catch(e) {
    if(e.message.includes('UNIQUE')) return res.status(409).json({error:'Username already taken'});
    res.status(500).json({error:'Server error'});
  }
});

// ════════════════════════════════════════════════════════════
//  CROWD
// ════════════════════════════════════════════════════════════
app.get('/api/crowd/current',(req,res)=>{
  const total=getCurrentCrowd();
  const zones={};
  ZONES.forEach(z=>{
    const c=Math.round(total*z.weight);
    zones[z.id]={name:z.name,count:c,max:z.max,percentage:Math.round((c/z.max)*100)};
  });
  res.json({total,level:total<500?'low':total<2000?'medium':'high',
    percentage:Math.round((total/5000)*100),waitTime:waitTime(total),zones,
    timestamp:new Date().toISOString()});
});

app.get('/api/crowd/today',(req,res)=>{
  const mul=currentMul();
  const hourly=HOURLY_PCT.map((_,h)=>crowdAtHour(h,mul));
  const today=new Date().toISOString().split('T')[0];
  const hist=db.prepare('SELECT hour,crowd_count FROM historical_crowd WHERE date=? ORDER BY hour').all(today);
  hist.forEach(r=>{ if(r.hour<new Date().getHours()) hourly[r.hour]=r.crowd_count; });
  res.json({hourly,date:today,dayMultiplier:mul});
});

app.get('/api/crowd/zones',(req,res)=>{
  const total=getCurrentCrowd();
  res.json(ZONES.map(z=>({...z,count:Math.round(total*z.weight),
    percentage:Math.round((Math.round(total*z.weight)/z.max)*100)})));
});

// ════════════════════════════════════════════════════════════
//  STATS (login page + dashboard KPIs)
// ════════════════════════════════════════════════════════════
app.get('/api/stats/today',(req,res)=>{
  const today=new Date().toISOString().split('T')[0];
  const crowd=getCurrentCrowd();
  const totalBookings=db.prepare("SELECT COUNT(*) as c FROM slot_bookings WHERE booking_date=? AND status!='cancelled'").get(today).c;
  const openGates=db.prepare('SELECT COUNT(*) as c FROM gate_status WHERE is_open=1').get().c;
  const h=new Date().getHours(); const mul=currentMul();
  let tp=0; for(let i=0;i<=h;i++) tp+=crowdAtHour(i,mul); tp=Math.round(tp/2);
  res.json({crowd,totalBookings,openGates,totalPilgrims:tp,
    level:crowd<500?'low':crowd<2000?'medium':'high',waitTime:waitTime(crowd)});
});

// ════════════════════════════════════════════════════════════
//  SLOTS
// ════════════════════════════════════════════════════════════
const ALL_SLOTS=['06:00–06:30','06:30–07:00','07:00–07:30','07:30–08:00',
  '08:00–08:30','08:30–09:00','09:00–09:30','09:30–10:00',
  '10:00–10:30','10:30–11:00','11:00–11:30','11:30–12:00',
  '12:00–12:30','12:30–13:00','16:00–16:30','16:30–17:00',
  '17:00–17:30','17:30–18:00','18:00–18:30','18:30–19:00'];

function slotMins(s){ const[h,m]=s.split('–')[0].split(':'); return +h*60+ +m; }

app.get('/api/slots',(req,res)=>{
  const date=req.query.date||new Date().toISOString().split('T')[0];
  const temple=req.query.temple||'somnath';
  const today=new Date().toISOString().split('T')[0];
  const nowM=new Date().getHours()*60+new Date().getMinutes();
  const isToday=(date===today);
  const slots=ALL_SLOTS.map(s=>{
    const sm=slotMins(s);
    const isPast=isToday&&sm+30<=nowM;
    const isCurrent=isToday&&sm<=nowM&&nowM<sm+30;
    const booked=db.prepare("SELECT COUNT(*) as c FROM slot_bookings WHERE slot_time=? AND booking_date=? AND temple_id=? AND status!='cancelled'").get(s,date,temple).c;
    const regular=60,reserve=20;
    const available=Math.max(0,regular-booked);
    const status=isPast?'DONE':available===0?'FULL':available<=8?'ALMOST FULL':'AVAILABLE';
    return{slot:s,total:80,regular,reserve,booked,available,status,isPast,isCurrent,isFull:available===0};
  });
  res.json(slots);
});

app.post('/api/slots/book',auth,(req,res)=>{
  const{temple_id,slot_time,booking_date,people,special_category}=req.body;
  const temple=temple_id||'somnath';
  const booked=db.prepare("SELECT COUNT(*) as c FROM slot_bookings WHERE slot_time=? AND booking_date=? AND temple_id=? AND status!='cancelled'").get(slot_time,booking_date,temple).c;
  if(booked>=80) return res.status(409).json({error:'Slot fully booked'});
  const isReserve=(booked>=60)?1:0;
  const id=uuidv4();
  const token='T'+Date.now().toString().slice(-5);
  db.prepare('INSERT INTO slot_bookings(id,user_id,temple_id,slot_time,booking_date,people,token,status,is_reserve,special_category) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id,req.user.id,temple,slot_time,booking_date,people||1,token,'upcoming',isReserve,special_category||null);
  res.json({id,token,slot_time,booking_date,temple_id:temple,people:people||1,is_reserve:isReserve,status:'upcoming'});
});

app.get('/api/slots/my',auth,(req,res)=>{
  const rows=db.prepare("SELECT * FROM slot_bookings WHERE user_id=? AND status!='cancelled' ORDER BY created_at DESC").all(req.user.id);
  res.json(rows);
});

app.delete('/api/slots/:id',auth,(req,res)=>{
  const b=db.prepare('SELECT * FROM slot_bookings WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if(!b) return res.status(404).json({error:'Not found'});
  db.prepare("UPDATE slot_bookings SET status='cancelled' WHERE id=?").run(req.params.id);
  res.json({success:true});
});

app.get('/api/slots/all',auth,secOnly,(req,res)=>{
  const date=req.query.date||new Date().toISOString().split('T')[0];
  const rows=db.prepare("SELECT sb.*,u.name as user_name FROM slot_bookings sb JOIN users u ON sb.user_id=u.id WHERE sb.booking_date=? AND sb.status!='cancelled' ORDER BY sb.slot_time").all(date);
  res.json(rows);
});

// ════════════════════════════════════════════════════════════
//  AI PREDICTION  (uses actual historical_crowd table)
// ════════════════════════════════════════════════════════════
app.get('/api/ai/predict',(req,res)=>{
  const hour=parseInt(req.query.hour)||new Date().getHours();
  const dayType=req.query.dayType||'weekday';
  const weather=req.query.weather||'sunny';

  let hist;
  if(dayType==='festival'){
    hist=db.prepare('SELECT AVG(crowd_count) as avg,COUNT(*) as cnt FROM historical_crowd WHERE hour=? AND is_festival=1').get(hour);
  } else {
    const dows=dayType==='weekend'?[0,6]:dayType==='holiday'?[0]:[1,2,3,4];
    const ph=dows.map(()=>'?').join(',');
    hist=db.prepare(`SELECT AVG(crowd_count) as avg,COUNT(*) as cnt FROM historical_crowd WHERE hour=? AND day_of_week IN(${ph})`).get(hour,...dows);
  }
  const base=hist?.avg||crowdAtHour(hour,1.0);
  const wMul=weather.includes('Rainy')||weather==='rainy'?0.6:weather.includes('Stormy')?0.35:weather.includes('Cloudy')?0.85:1.0;
  const predicted=Math.round(base*wMul);
  const confidence=Math.min(95,75+Math.min(20,Math.floor((hist?.cnt||0)/4)));
  res.json({predicted,level:predicted<500?'low':predicted<2000?'medium':'high',
    hour,dayType,weather,confidence,historicalSamples:hist?.cnt||0,
    waitTime:waitTime(predicted)});
});

app.get('/api/ai/today24h',(req,res)=>{
  const dow=new Date().getDay();
  const isW=(dow===0||dow===6);
  const dows=isW?[0,6]:[1,2,3,4];
  const ph=dows.map(()=>'?').join(',');
  const predictions=[];
  for(let h=0;h<24;h++){
    const r=db.prepare(`SELECT AVG(crowd_count) as avg FROM historical_crowd WHERE hour=? AND day_of_week IN(${ph})`).get(h,...dows);
    predictions.push(Math.round(r?.avg||crowdAtHour(h,currentMul())));
  }
  res.json({predictions,dayType:isW?'weekend':'weekday'});
});

app.get('/api/ai/week',(req,res)=>{
  const today=new Date().getDay();
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const forecast=[];
  for(let i=0;i<7;i++){
    const di=(today+i)%7;
    const r=db.prepare('SELECT AVG(crowd_count) as avg FROM historical_crowd WHERE hour=18 AND day_of_week=?').get(di);
    const peak=Math.round(r?.avg||crowdAtHour(18,DAY_MUL[di]));
    forecast.push({dayIndex:di,label:days[di]+(i===0?' ★':''),peak,
      level:peak<1500?'low':peak<3000?'medium':'high',offset:i});
  }
  res.json(forecast);
});

// ════════════════════════════════════════════════════════════
//  GATES
// ════════════════════════════════════════════════════════════
app.get('/api/gates',(req,res)=>res.json(db.prepare('SELECT * FROM gate_status ORDER BY id').all()));

app.put('/api/gates/:id',auth,secOnly,(req,res)=>{
  db.prepare('UPDATE gate_status SET is_open=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.body.is_open?1:0,req.params.id);
  res.json({success:true});
});
app.put('/api/gates',auth,secOnly,(req,res)=>{
  db.prepare('UPDATE gate_status SET is_open=?,updated_at=CURRENT_TIMESTAMP').run(req.body.is_open?1:0);
  res.json({success:true});
});

// ════════════════════════════════════════════════════════════
//  ALERTS
// ════════════════════════════════════════════════════════════
app.get('/api/alerts',(req,res)=>{
  const c=getCurrentCrowd();
  const now=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  const dyn=[];
  if(c>=4000) dyn.push({id:'dyn-1',level:'high',title:'Critical Overcrowding',description:`${c.toLocaleString()} pilgrims – 80%+ capacity. Immediate action required.`,zone:'All Zones',is_acknowledged:0,created_at:now});
  if(c>=2500) dyn.push({id:'dyn-2',level:'high',title:'Main Hall Overcrowding',description:'Main hall exceeds safe capacity. Deploy extra staff.',zone:'Main Hall',is_acknowledged:0,created_at:now});
  if(c>=1200) dyn.push({id:'dyn-3',level:'medium',title:'Entry Gate Queue Building',description:`Wait time ${waitTime(c)} at main gate. Open extra lanes.`,zone:'Entry Gate',is_acknowledged:0,created_at:now});
  const h=new Date().getHours();
  const nextPeak=h<11?'11:00 AM':h<18?'6:00 PM':'tomorrow 6:00 AM';
  dyn.push({id:'dyn-info',level:'low',title:`Next Peak: ${nextPeak}`,description:`AI predicts next crowd peak at ${nextPeak}. Prepare staff.`,zone:'All Zones',is_acknowledged:1,created_at:now});
  const static_=db.prepare('SELECT * FROM alerts WHERE is_resolved=0 ORDER BY created_at DESC').all();
  res.json([...dyn,...static_]);
});

app.post('/api/alerts/:id/acknowledge',auth,secOnly,(req,res)=>{
  if(!req.params.id.startsWith('dyn-')) db.prepare('UPDATE alerts SET is_acknowledged=1 WHERE id=?').run(req.params.id);
  res.json({success:true});
});
app.post('/api/alerts/:id/resolve',auth,secOnly,(req,res)=>{
  if(!req.params.id.startsWith('dyn-')) db.prepare('UPDATE alerts SET is_resolved=1 WHERE id=?').run(req.params.id);
  res.json({success:true});
});
app.post('/api/alerts',auth,secOnly,(req,res)=>{
  const{level,title,description,zone}=req.body;
  const id=uuidv4();
  db.prepare('INSERT INTO alerts(id,level,title,description,zone) VALUES(?,?,?,?,?)').run(id,level||'low',title,description||'',zone||'All Zones');
  res.json({id,success:true});
});

// ── Store current crowd to DB every minute ────────────────────
function storeCrowdTick(){
  const c=getCurrentCrowd(),today=new Date().toISOString().split('T')[0],h=new Date().getHours(),dow=new Date().getDay();
  db.prepare('INSERT OR REPLACE INTO historical_crowd(date,hour,day_of_week,crowd_count,is_weekend,temple_id) VALUES(?,?,?,?,?,?)')
    .run(today,h,dow,c,(dow===0||dow===6)?1:0,'somnath');
}
storeCrowdTick();
setInterval(storeCrowdTick,60000);

app.listen(PORT,()=>{
  console.log(`\n🛕  DevDarshan backend → http://localhost:${PORT}`);
  console.log(`🖥️   Open app at       → http://localhost:${PORT}/index.html\n`);
});
