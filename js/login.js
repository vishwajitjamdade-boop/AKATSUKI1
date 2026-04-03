// ===== DEVDARSHAN LOGIN PAGE =====
let currentRole = null;

// ── Particles ─────────────────────────────────────────────────
(function createParticles(){
  const c=document.getElementById('bgParticles'); if(!c) return;
  for(let i=0;i<40;i++){
    const p=document.createElement('div'); p.className='particle';
    p.style.left=(i*2.5+7)+'%'; p.style.width=(i%4+1)+'px'; p.style.height=p.style.width;
    p.style.animationDuration=((i%8)+8)+'s'; p.style.animationDelay=(i%6)+'s';
    p.style.opacity=(0.3+(i%5)*0.12).toFixed(2);
    if(i%3===0) p.style.background='#ff6b35';
    if(i%5===0) p.style.background='#ffd77a';
    c.appendChild(p);
  }
})();

// ── Animate counter ───────────────────────────────────────────
function animateCounter(el, target){
  if(!el) return;
  if(!target||target===0){el.textContent='0';return;}
  let cur=0; const step=target/60;
  const t=setInterval(()=>{cur+=step;if(cur>=target){cur=target;clearInterval(t);}el.textContent=Math.floor(cur).toLocaleString('en-IN');},22);
}

// ── Load stats ────────────────────────────────────────────────
// Inline fallback so login page doesn't depend on api.js
const _LPC=[2,2,1,1,3,8,25,48,66,82,89,93,87,68,48,42,57,74,96,91,72,50,28,8];
const _LDM=[1.55,1.0,1.0,1.05,1.10,1.20,1.40];
function _loginCrowd(){
  const h=new Date().getHours(),m=new Date().getMinutes(),dow=new Date().getDay(),mul=_LDM[dow];
  const base=Math.round((_LPC[h]/100)*5000*mul),next=Math.round((_LPC[(h+1)%24]/100)*5000*mul);
  return Math.round(base+(next-base)*(m/60));
}
function _loginPilgrims(){
  const h=new Date().getHours(),mul=_LDM[new Date().getDay()];
  let t=0;for(let i=0;i<=h;i++)t+=Math.round((_LPC[i]/100)*5000*mul);return Math.round(t/2);
}

window.addEventListener('load',async()=>{
  try{
    const ctrl=new AbortController(); setTimeout(()=>ctrl.abort(),2500);
    const stats=await fetch('http://localhost:3000/api/stats/today',{signal:ctrl.signal}).then(r=>r.json());
    animateCounter(document.getElementById('statPilgrims'),stats.totalPilgrims||0);
    animateCounter(document.getElementById('statSlots'),   stats.totalBookings||0);
    const lvl=stats.level||'low';
    const crowdEl=document.querySelector('.stat-val.stat-green');
    if(crowdEl){
      if(lvl==='low')    {crowdEl.textContent='🟢 Low';    crowdEl.style.color='#66bb6a';}
      else if(lvl==='medium'){crowdEl.textContent='🟡 Medium';crowdEl.style.color='#ffd54f';}
      else               {crowdEl.textContent='🔴 High';   crowdEl.style.color='#ef5350';}
    }
  }catch(e){
    // Server offline – use time-based fallback for stats
    const c=_loginCrowd(), tp=_loginPilgrims();
    const h=new Date().getHours(), m_=new Date().getMinutes();
    const nm=h*60+m_;
    const ps=Math.max(0,Math.floor((nm-360)/30));
    const bk=Math.min(ps*60,1800);
    animateCounter(document.getElementById('statPilgrims'),tp);
    animateCounter(document.getElementById('statSlots'),bk);
    const crowdEl=document.querySelector('.stat-val.stat-green');
    if(crowdEl){
      if(c<500)    {crowdEl.textContent='🟢 Low';    crowdEl.style.color='#66bb6a';}
      else if(c<2000){crowdEl.textContent='🟡 Medium';crowdEl.style.color='#ffd54f';}
      else         {crowdEl.textContent='🔴 High';   crowdEl.style.color='#ef5350';}
    }
  }
});

// ── Role selection ────────────────────────────────────────────
function selectRole(role){
  currentRole=role;
  document.getElementById('securityCard').classList.remove('selected-security','selected-devotee');
  document.getElementById('devoteeCard').classList.remove('selected-security','selected-devotee');
  if(role==='security') document.getElementById('securityCard').classList.add('selected-security');
  else document.getElementById('devoteeCard').classList.add('selected-devotee');

  document.getElementById('formIcon').textContent=role==='security'?'🛡️':'🙏';
  document.getElementById('formIcon').style.background=role==='security'?'rgba(79,195,247,0.15)':'rgba(206,147,216,0.15)';
  document.getElementById('formTitle').textContent=role==='security'?'Security Admin Login':'Devotee Login';
  document.getElementById('formSubtitle').textContent=role==='security'?'Temple Security Control Panel':'Book your darshan slot';
  document.getElementById('demoText').textContent=role==='security'?'ID: admin | Password: admin123':'ID: devotee | Password: dev123';

  const regLink=document.getElementById('registerLink');
  if(regLink) regLink.style.display=role==='devotee'?'block':'none';

  document.querySelector('.role-section').style.animation='fadeOut 0.3s ease forwards';
  setTimeout(()=>{
    document.querySelector('.role-section').style.display='none';
    const fs=document.getElementById('loginFormSection');
    fs.classList.add('visible'); fs.style.animation='formSlide 0.4s ease';
  },280);
}

function goBack(){
  document.getElementById('loginFormSection').classList.remove('visible');
  const rs=document.querySelector('.role-section');
  rs.style.display=''; rs.style.animation='fadeUp 0.4s ease';
  document.getElementById('securityCard').classList.remove('selected-security','selected-devotee');
  document.getElementById('devoteeCard').classList.remove('selected-security','selected-devotee');
  document.getElementById('loginForm').reset();
  showLogin();
}

function togglePassword(){
  const p=document.getElementById('password'); p.type=p.type==='password'?'text':'password';
}

function _showBtnError(msg){
  const btn=document.getElementById('loginBtn');
  const btnText=btn.querySelector('.btn-text');
  const spinner=btn.querySelector('.btn-spinner');
  if(spinner) spinner.style.display='none';
  if(btnText) btnText.style.display='inline-block';
  btn.disabled=false;
  btn.style.background='linear-gradient(135deg,#e53935,#c62828)';
  if(btnText) btnText.textContent='✗ '+msg;
  document.getElementById('formCard').style.animation='shake 0.4s ease';
  setTimeout(()=>{btn.style.background='';if(btnText)btnText.textContent='Login';btn.disabled=false;document.getElementById('formCard').style.animation='';},1800);
}

function _loginSuccess(role, username, name){
  // Store minimal session (works offline)
  sessionStorage.setItem('dd_role',  role);
  sessionStorage.setItem('dd_user',  username);
  sessionStorage.setItem('dd_name',  name||username);
  sessionStorage.setItem('dd_login_time', new Date().toISOString());

  const btn=document.getElementById('loginBtn');
  const btnText=btn.querySelector('.btn-text');
  const spinner=btn.querySelector('.btn-spinner');
  if(spinner) spinner.style.display='none';
  if(btnText){btnText.style.display='inline-block';btnText.textContent='✓ Logged in!';}
  btn.style.background='linear-gradient(135deg,#66bb6a,#43a047)';
  setTimeout(()=>{
    window.location.href=role==='security'?'security-dashboard.html':'devotee-dashboard.html';
  },700);
}

// ── Handle login (try API → fallback to local) ────────────────
function handleLogin(e){
  e.preventDefault();
  const username=document.getElementById('username').value.trim();
  const password=document.getElementById('password').value.trim();
  const btn=document.getElementById('loginBtn');
  const btnText=btn.querySelector('.btn-text');
  const spinner=btn.querySelector('.btn-spinner');
  if(btnText) btnText.style.display='none';
  if(spinner) spinner.style.display='inline-block';
  btn.disabled=true;

  // 1. Try real API (3s timeout)
  const ctrl=new AbortController(); setTimeout(()=>ctrl.abort(),3000);
  fetch('http://localhost:3000/api/auth/login',{
    method:'POST', signal:ctrl.signal,
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username,password})
  })
  .then(async r=>({ok:r.ok,data:await r.json()}))
  .then(({ok,data})=>{
    if(ok&&data.token){
      sessionStorage.setItem('dd_token', data.token);
      _loginSuccess(data.role, data.username, data.name);
    } else {
      _showBtnError(data.error||'Invalid Credentials');
    }
  })
  .catch(()=>{
    // 2. Server offline → local credential check
    const LOCAL={
      admin:   {password:'admin123', role:'security', name:'Security Admin'},
      devotee: {password:'dev123',   role:'devotee',  name:'Demo Devotee'}
    };
    const cred=LOCAL[username];
    if(cred && cred.password===password){
      if(currentRole && cred.role!==currentRole){
        _showBtnError('Wrong portal selected');
        return;
      }
      _loginSuccess(cred.role, username, cred.name);
    } else {
      _showBtnError('Invalid Credentials');
    }
  });
}

// ── Register new devotee ──────────────────────────────────────
function showRegister(){
  document.getElementById('loginForm').style.display='none';
  document.getElementById('registerLink').style.display='none';
  document.getElementById('registerForm').style.display='block';
}
function showLogin(){
  const f=document.getElementById('registerForm');
  const r=document.getElementById('registerLink');
  if(f) f.style.display='none';
  document.getElementById('loginForm').style.display='block';
  if(r&&currentRole==='devotee') r.style.display='block';
}

function handleRegister(e){
  e.preventDefault();
  const username=document.getElementById('regUsername').value.trim();
  const name    =document.getElementById('regName').value.trim();
  const password=document.getElementById('regPassword').value.trim();
  const btn=document.getElementById('registerBtn');
  btn.disabled=true; btn.textContent='Creating…';

  const ctrl=new AbortController(); setTimeout(()=>ctrl.abort(),3000);
  fetch('http://localhost:3000/api/auth/register',{
    method:'POST', signal:ctrl.signal,
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username,password,name})
  })
  .then(async r=>({ok:r.ok,data:await r.json()}))
  .then(({ok,data})=>{
    if(ok&&data.token){
      sessionStorage.setItem('dd_token', data.token);
      _loginSuccess('devotee', data.username, data.name);
    } else {
      btn.disabled=false; btn.textContent='Create Account';
      alert(data.error||'Registration failed');
    }
  })
  .catch(()=>{
    // Offline: create local account
    if(!username||!password){btn.disabled=false;btn.textContent='Create Account';alert('Fill all fields');return;}
    _loginSuccess('devotee', username, name||username);
  });
}

// ── Inject keyframe styles ────────────────────────────────────
const _s=document.createElement('style');
_s.textContent=`
  @keyframes fadeOut{to{opacity:0;transform:translateY(-10px)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
  @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(10px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
  @keyframes formSlide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
`;
document.head.appendChild(_s);
