/* ---------- utilities ---------- */
function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let pendingDeleteResolve = null;
function confirmDelete(msg){
  return new Promise(resolve=>{
    pendingDeleteResolve = resolve;
    openModal('Delete', '<div class=\"delete-confirm-body\">'+
      '<div class=\"delete-confirm-icon\">🗑</div>'+      '<h3 class=\"delete-confirm-title\">'+esc(msg || 'Do you want to delete this?')+'</h3>'+      '<p class=\"delete-confirm-text\">This action cannot be undone.</p>'+      '<div class=\"delete-confirm-actions\">'+      '<button class=\"btn btn-ghost\" type=\"button\" onclick=\"resolveDelete(false)\">Cancel</button>'+      '<button class=\"btn delete-confirm-btn\" type=\"button\" onclick=\"resolveDelete(true)\">Delete</button>'+      '</div></div>');
  });
}
function resolveDelete(value){
  const resolve = pendingDeleteResolve;
  pendingDeleteResolve = null;
  closeModal();
  if(resolve) resolve(!!value);
}
function uid(){ return Math.random().toString(36).slice(2,10); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function daysAgoStr(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function last7Dates(){ const a=[]; for(let i=6;i>=0;i--) a.push(daysAgoStr(i)); return a; }
function fmtDateLong(d){ return new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}); }
function fmtDateShort(d){ return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function fmtMoney(n){ n=Number(n)||0; const sym=appSettings.currency==='USD'?'$':appSettings.currency==='EUR'?'€':appSettings.currency==='JPY'?'¥':'₱'; return (n<0?'-':'')+sym+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtUSD(n){ n=Number(n)||0; return (n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtClock(ms){ const t=Math.max(0,Math.floor(ms/1000)); const m=Math.floor(t/60); const s=t%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
function statCard(label,value,sub,color){ color=color||'var(--c-amber)'; return '<div class="stat-card" style="--accent:'+color+'"><div class="stat-label">'+label+'</div><div class="stat-value">'+value+'</div>'+(sub?'<div class="stat-sub">'+sub+'</div>':'')+'</div>'; }
function progressBar(pct,color){ color=color||'var(--c-amber)'; const p=Math.max(0,Math.min(100,pct||0)); return '<div class="progress"><div class="progress-bar" style="width:'+p+'%;background:'+color+'"></div></div>'; }
function table(headers,rows){ return '<div class="table-wrap"><table class="tbl"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+headers.length+'" class="empty-td">Nothing logged yet.</td></tr>')+'</tbody></table></div>'; }
function beep(){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value=880; g.gain.value=.15; o.start(); setTimeout(()=>{o.stop(); ctx.close();},300);}catch(e){} }

/* ---------- modal system ---------- */
function openModal(title, bodyHtml){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal(){
  const pending = pendingDeleteResolve;
  pendingDeleteResolve = null;
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalBody').innerHTML = '';
  document.querySelector('.modal-box')?.classList.remove('account-modal-box');
  if(pending) pending(false);
}
function bindModalSubmit(handler){
  const f=document.getElementById('modalForm');
  if(!f) return;
  f.addEventListener('submit', async function(e){
    await handler(e);
    closeModal();
  });
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

/* ---------- responsive sidebar drawer ---------- */
let sidebarOpen=false;
function syncSidebar(){
  const sb=document.querySelector('.sidebar'); const bd=document.getElementById('sidebarBackdrop');
  if(sb) sb.classList.toggle('open', sidebarOpen);
  if(bd) bd.classList.toggle('open', sidebarOpen);
}
function toggleSidebar(){ sidebarOpen=!sidebarOpen; syncSidebar(); }
function closeSidebar(){ sidebarOpen=false; syncSidebar(); }

/* ---------- production local storage adapter ---------- */
(function ensureIndexedDBStorage(){
  if(window.storage && typeof window.storage.get==='function' && typeof window.storage.set==='function') return;
  const DB='ledger_local_v1', STORE='kv';
  function openDB(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open(DB,1); req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); }; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
  // IMPORTANT: local Life Management data is account-scoped. A browser/device can be
  // used by multiple Supabase accounts, so unscoped keys would leak one
  // account's data into another account after sign-in.
  function scopedKey(key){
    const uid = window.__ledgerStorageUserId || 'legacy-unassigned';
    return 'user:'+uid+':'+key;
  }
  window.storage={
    async get(key){ const db=await openDB(); const sk=scopedKey(key); return new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readonly'), req=tx.objectStore(STORE).get(sk); req.onsuccess=()=>resolve(req.result===undefined?null:{key,value:req.result}); req.onerror=()=>reject(req.error); }); },
    async set(key,value){ const db=await openDB(); const sk=scopedKey(key); return new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(value,sk); tx.oncomplete=()=>resolve({key,value}); tx.onerror=()=>reject(tx.error); }); },
    async remove(key){ const db=await openDB(); const sk=scopedKey(key); return new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(sk); tx.oncomplete=()=>resolve(true); tx.onerror=()=>reject(tx.error); }); }
  };
})();

/* ---------- data ---------- */
const defaults = {
  money:{accounts:[],transactions:[],budgets:[],bills:[],noSpendDays:[],noSpendRules:[],categories:{income:['Salary','Freelance','Business','Other'],expense:['Rent','Food','Transpo','Utilities','Shopping','Health','Entertainment','Other']}},
  trading:{trades:[]},
  habits:{habits:[],logs:{}},
  running:{runs:[]},
  workout:{sessions:[],categories:['Leg Day','Upper Body','Core','Rest'],schedule:{},exerciseLogs:[],exercisePlans:[],bodyWeights:[]},
  meals:{goal:{cal:2000,protein:120},entries:[],preps:[],prepLogs:{}},
  sleep:{entries:[],goalHours:8},
  water:{goal:2000,entries:[]},
  todos:{items:[]},
  calendar:{events:[],reminders:[]},
  reading:{books:[]},
  journal:{entries:[],gratitude:[]},
  groceries:{items:[]},
};
let state = {};
async function loadAll(){
  const keys = Object.keys(defaults);
  await Promise.all(keys.map(async k=>{
    try{
      const r = await window.storage.get(k,false);
      state[k] = r ? JSON.parse(r.value) : JSON.parse(JSON.stringify(defaults[k]));
    }catch(e){ state[k] = JSON.parse(JSON.stringify(defaults[k])); }
  }));
  // backfill fields for previously-saved data
  if(!state.money.budgets) state.money.budgets=[];
  if(!state.money.bills) state.money.bills=[];
  if(!state.money.noSpendDays) state.money.noSpendDays=[];
  if(!state.money.noSpendRules) state.money.noSpendRules=[];
  if(!state.money.categories) state.money.categories={income:['Salary','Freelance','Business','Other'],expense:['Rent','Food','Transpo','Utilities','Shopping','Health','Entertainment','Other']};
  if(!state.money.categories.income) state.money.categories.income=['Salary','Freelance','Business','Other'];
  if(!state.money.categories.expense) state.money.categories.expense=['Rent','Food','Transpo','Utilities','Shopping','Health','Entertainment','Other'];
   state.money.budgets.forEach(b=>{ if(b.reminderNeeded===undefined) b.reminderNeeded=false; });
   state.money.bills.forEach(b=>{ if(b.paidDates===undefined) b.paidDates=[]; if(b.category===undefined) b.category=''; });
  if(!state.workout.categories) state.workout.categories=['Leg Day','Upper Body','Core','Rest'];
  if(!state.workout.schedule) state.workout.schedule={};
  if(!state.workout.exerciseLogs) state.workout.exerciseLogs=[];
  if(!state.workout.exercisePlans) state.workout.exercisePlans=[];
  if(!state.workout.bodyWeights) state.workout.bodyWeights=[];
  if(state.money.noSpendRules) state.money.noSpendRules.forEach(r=>{ if(r.type==='weekly'&&!r.startDate) r.startDate=todayStr(); if(r.type==='weekly'&&!r.createdAt) r.createdAt=new Date().toISOString(); });
  if(!state.calendar.reminders) state.calendar.reminders=[];
  if(!state.calendar.customCategories) state.calendar.customCategories=[];
  if(!state.calendar.customCategories.some(c=>c.name==='Meeting')) state.calendar.customCategories.push({name:'Meeting',color:'#8b5cf6'});
  // Unified Calendar migration: Events, Tasks, Errands and Reminders now live in one list.
  // Existing reminders and legacy To-Do records are converted once, preserving their dates.
  let calendarChanged=false;
  state.calendar.events=(state.calendar.events||[]).map(e=>{ if(!e.category) {e.category='Event'; calendarChanged=true;} if(e.done===undefined) e.done=false; return e; });
  if(!state.calendar._unifiedV1){
    const legacyReminders=[...(state.calendar.reminders||[])];
    const legacyTodos=[...(state.todos.items||[])];
    for(const r of legacyReminders){
      state.calendar.events.push({id:uid(),date:r.date,time:r.time||'',title:r.title,category:'Reminder',priority:r.priority||'medium',done:false});
      await markTombstone('calendar.reminders',r.id);
      calendarChanged=true;
    }
    for(const t of legacyTodos){
      state.calendar.events.push({id:uid(),date:t.due||todayStr(),time:'',title:t.text,category:'Task',priority:t.priority||'medium',done:!!t.done,completedDate:t.completedDate||null});
      await markTombstone('todos.items',t.id);
      calendarChanged=true;
    }
    state.calendar.reminders=[];
    state.todos.items=[];
    state.calendar._unifiedV1=true;
    calendarChanged=true;
  }
  if(calendarChanged){
    try{ await window.storage.set('calendar',JSON.stringify(state.calendar),false); await window.storage.set('todos',JSON.stringify(state.todos),false); }catch(e){}
  }
  // Migrate legacy per-session exercise logs into reusable exercise plans.
  if(!state.workout._plansMigrated){
    const plans=state.workout.exercisePlans;
    (state.workout.exerciseLogs||[]).forEach(l=>{
      let plan=plans.find(x=>x.name===l.exercise && x.category===l.category);
      if(!plan){
        plan={id:uid(),name:l.exercise,category:l.category,weekdays:[new Date(l.date+'T00:00:00').getDay()],defaultSets:Number(l.sets)||0,defaultReps:Number(l.reps)||0,defaultWeight:Number(l.weight)||0,actuals:[]};
        plans.push(plan);
      }
      if(!plan.actuals.some(a=>a.date===l.date)) plan.actuals.push({date:l.date,sets:Number(l.sets)||0,reps:Number(l.reps)||0,weight:Number(l.weight)||0});
    });
    state.workout._plansMigrated=true;
  }
  if(!state.sleep.goalHours) state.sleep.goalHours=8;
  if(!state.meals.preps) state.meals.preps=[];
  if(!state.meals.prepLogs) state.meals.prepLogs={};
  if(!state.journal) state.journal={entries:[],gratitude:[]};
  if(!state.journal.gratitude) state.journal.gratitude=[];
  if(!state.journal) state.journal={entries:[]};
  if(!state.groceries) state.groceries={items:[]};
  if(!state.journal.entries) state.journal.entries=[];
  if(!state.groceries.items) state.groceries.items=[];
  state.groceries.items.forEach(x=>{ if(!x.date) x.date=todayStr(); if(x.price===undefined) x.price=Number(x.amount||0)||0; });
  state.reading.books.forEach(b=>{ if(!b.addedDate) b.addedDate=todayStr(); });
  state.meals.preps.forEach(p=>{ if(p.cal===undefined) p.cal=0; if(p.protein===undefined) p.protein=0; });
  state.habits.habits.forEach(h=>{ if(!h.days) h.days=[0,1,2,3,4,5,6]; });
  state.meals.entries.forEach(e=>{ if(e.category===undefined) e.category=''; });
  state.trading.trades.forEach(t=>{ if(t.setup===undefined) t.setup=''; if(t.image===undefined) t.image=null; });
  state.reading.books.forEach(b=>{ if(b.notes===undefined) b.notes=''; });
  state.money.bills.forEach(b=>{ if(!b.paymentMeta) b.paymentMeta=[]; });
  const snap=await readLocalSnapshot();
  if(snap && snap.state && Object.keys(snap.state).length) localRevision=Math.max(localRevision,Number(snap.revision)||0);
  await saveLocalSnapshot();
}
async function save(k){
  try{
    await window.storage.set(k, JSON.stringify(state[k]), false);
    localRevision++;
    await setSyncDirty(true);
    try{ const meta=await readSyncMeta()||{}; meta.pendingDomains=Array.from(new Set([...(Array.isArray(meta.pendingDomains)?meta.pendingDomains:[]),k])); meta.pendingAt=new Date().toISOString(); await writeSyncMeta(meta); }catch(e){}
    if(navigator.onLine && supabaseUser){ syncStatus='Local changes pending · syncing soon'; updateAuthUI(); }
    else if(supabaseUser){ syncStatus='Offline · saved locally'; updateAuthUI(); }
    scheduleLocalSnapshot();
    scheduleCloudSync(navigator.onLine && supabaseUser ? 250 : 900);
  }catch(e){ console.error('save failed',k,e); }
}
async function saveLocalSnapshot(){
  try{
    const snapshot={schemaVersion:SYNC_SCHEMA_VERSION,revision:localRevision,savedAt:new Date().toISOString(),state:JSON.parse(JSON.stringify(state))};
    await window.storage.set(LOCAL_SNAPSHOT_KEY,JSON.stringify(snapshot),false);
  }catch(e){ console.error('local snapshot failed',e); }
}
function scheduleLocalSnapshot(){
  clearTimeout(snapshotTimer);
  snapshotTimer=setTimeout(()=>saveLocalSnapshot(),150);
}
async function readLocalSnapshot(){
  try{ const r=await window.storage.get(LOCAL_SNAPSHOT_KEY,false); return r?JSON.parse(r.value):null; }catch(e){ return null; }
}
async function writeSyncMeta(meta){
  try{ await window.storage.set(LOCAL_SYNC_META_KEY,JSON.stringify(meta),false); }catch(e){}
}
async function readSyncMeta(){
  try{ const r=await window.storage.get(LOCAL_SYNC_META_KEY,false); return r?JSON.parse(r.value):null; }catch(e){ return null; }
}

function cloneJson(v){ try{return JSON.parse(JSON.stringify(v));}catch(e){return v;} }
async function readLocalTombstones(){
  try{ const meta=await readSyncMeta(); return (meta&&meta.tombstones&&typeof meta.tombstones==='object')?cloneJson(meta.tombstones):{}; }catch(e){ return {}; }
}
async function writeLocalTombstones(tombstones){
  try{ const meta=await readSyncMeta()||{}; meta.tombstones=cloneJson(tombstones||{}); await writeSyncMeta(meta); }catch(e){}
}
async function markTombstone(scope,key){
  if(key==null) return;
  const t=await readLocalTombstones();
  if(!Array.isArray(t[scope])) t[scope]=[];
  const k=String(key);
  if(!t[scope].includes(k)) t[scope].push(k);
  await writeLocalTombstones(t);
}
function tombstoneSet(tombstones,scope){ return new Set(Array.isArray(tombstones?.[scope])?tombstones[scope].map(String):[]); }
function applyTombstonesToState(input,tombstones){
  const out=cloneJson(input)||{};
  const removeIds=(arr,keys)=>Array.isArray(arr)?arr.filter(x=>!keys.has(String(x?.id))):arr;
  const removeDateKeys=(arr,keys)=>Array.isArray(arr)?arr.filter(x=>!keys.has(String(x?.date))):arr;
  if(out.money){ out.money.accounts=removeIds(out.money.accounts,tombstoneSet(tombstones,'money.accounts')); out.money.transactions=removeIds(out.money.transactions,tombstoneSet(tombstones,'money.transactions')); out.money.budgets=removeIds(out.money.budgets,tombstoneSet(tombstones,'money.budgets')); out.money.bills=removeIds(out.money.bills,tombstoneSet(tombstones,'money.bills')); out.money.noSpendRules=removeIds(out.money.noSpendRules,tombstoneSet(tombstones,'money.noSpendRules')); const ns=tombstoneSet(tombstones,'money.noSpendDays'); out.money.noSpendDays=(out.money.noSpendDays||[]).filter(x=>!ns.has(String(x))); }
  if(out.trading) out.trading.trades=removeIds(out.trading.trades,tombstoneSet(tombstones,'trading.trades'));
  if(out.habits){ const hs=tombstoneSet(tombstones,'habits.habits'); out.habits.habits=removeIds(out.habits.habits,hs); Object.keys(out.habits.logs||{}).forEach(d=>{ hs.forEach(id=>{ if(out.habits.logs[d]) delete out.habits.logs[d][id]; }); }); }
  if(out.running) out.running.runs=removeIds(out.running.runs,tombstoneSet(tombstones,'running.runs'));
  if(out.workout){ out.workout.sessions=removeIds(out.workout.sessions,tombstoneSet(tombstones,'workout.sessions')); out.workout.exercisePlans=removeIds(out.workout.exercisePlans,tombstoneSet(tombstones,'workout.exercisePlans')); const logs=tombstoneSet(tombstones,'workout.exerciseLogs'); (out.workout.exercisePlans||[]).forEach(p=>{ p.actuals=(p.actuals||[]).filter(a=>!logs.has(String(p.id)+'::'+String(a.date))); }); }
  if(out.meals){ out.meals.entries=removeIds(out.meals.entries,tombstoneSet(tombstones,'meals.entries')); out.meals.preps=removeIds(out.meals.preps,tombstoneSet(tombstones,'meals.preps')); const pl=tombstoneSet(tombstones,'meals.prepLogs'); Object.keys(out.meals.prepLogs||{}).forEach(k=>{if(pl.has(String(k))) delete out.meals.prepLogs[k];}); }
  if(out.sleep) out.sleep.entries=removeIds(out.sleep.entries,tombstoneSet(tombstones,'sleep.entries'));
  if(out.water) out.water.entries=removeIds(out.water.entries,tombstoneSet(tombstones,'water.entries'));
  if(out.todos) out.todos.items=removeIds(out.todos.items,tombstoneSet(tombstones,'todos.items'));
  if(out.calendar){ out.calendar.events=removeIds(out.calendar.events,tombstoneSet(tombstones,'calendar.events')); out.calendar.reminders=removeIds(out.calendar.reminders,tombstoneSet(tombstones,'calendar.reminders')); }
  if(out.reading) out.reading.books=removeIds(out.reading.books,tombstoneSet(tombstones,'reading.books'));
  if(out.journal){ out.journal.entries=removeIds(out.journal.entries,tombstoneSet(tombstones,'journal.entries')); out.journal.gratitude=removeIds(out.journal.gratitude,tombstoneSet(tombstones,'journal.gratitude')); }
  if(out.groceries) out.groceries.items=removeIds(out.groceries.items,tombstoneSet(tombstones,'groceries.items'));
  return out;
}
function mergeTombstones(a,b){
  const out={}; const keys=new Set([...Object.keys(a||{}),...Object.keys(b||{})]);
  for(const k of keys){ const set=new Set([...(Array.isArray(a?.[k])?a[k]:[]),...(Array.isArray(b?.[k])?b[k]:[])].map(String)); if(set.size) out[k]=[...set]; }
  return out;
}
async function setSyncDirty(value){
  try{ await window.storage.set(LOCAL_SYNC_DIRTY_KEY,value?'1':'0',false); }catch(e){}
}
async function isSyncDirty(){
  try{ const r=await window.storage.get(LOCAL_SYNC_DIRTY_KEY,false); return r?.value==='1'; }catch(e){ return false; }
}
async function hasLocalChangesPending(){
  if(await isSyncDirty()) return true;
  try{
    const meta=await readSyncMeta();
    if(!meta?.fingerprint) return false;
    const fp=stateFingerprint(state);
    if(fp!==meta.fingerprint) return true;
    if(Number(localRevision||0)>Number(meta.localRevision||0)) return true;
  }catch(e){}
  return false;
}

/* ---------- domain constants ---------- */
const TRADE_SETUPS=['AA+ Setup','Average Setup','Emotion Setup','FOMO'];
const MEAL_CATEGORIES=['Post Workout','Pre Workout','Breakfast','Lunch','AM Snack','PM Snack','Dinner','Midnight Snack'];

/* ---------- domain helpers ---------- */
function acctBalance(id){
  const a=state.money.accounts.find(x=>x.id===id); if(!a) return 0;
  const sum=state.money.transactions.reduce((s,t)=>{
    const amount=Number(t.amount)||0;
    if(t.type==='transfer'){ if(t.account===id) s-=amount; if(t.toAccount===id) s+=amount; return s; }
    if(t.account===id) s+=(t.type==='income'?amount:-amount);
    return s;
  },0);
  return (Number(a.start)||0)+sum;
}
function totalBalance(){ return state.money.accounts.reduce((s,a)=>s+acctBalance(a.id),0); }
function monthTxns(){ const ym=todayStr().slice(0,7); return state.money.transactions.filter(t=>t.date.startsWith(ym)); }
function tradePL(t){ const dir=t.side==='long'?1:-1; return (Number(t.exit)-Number(t.entry))*Number(t.size)*dir; }
function habitStreak(id){ const h=state.habits.habits.find(x=>x.id===id); const days=h&&h.days?h.days:[0,1,2,3,4,5,6]; let streak=0,i=0; while(true){ const d=daysAgoStr(i); const dow=new Date(d+'T00:00:00').getDay(); if(!days.includes(dow)){ i++; continue; } if(state.habits.logs[d] && state.habits.logs[d][id]){ streak++; i++; } else break; } return streak; }
function paceStr(distance,duration){ if(!distance) return '--'; const p=duration/distance; const m=Math.floor(p); const s=Math.round((p-m)*60); return m+':'+String(s).padStart(2,'0')+'/km'; }
function weekDistance(){ const d=last7Dates(); return state.running.runs.filter(r=>d.includes(r.date)).reduce((s,r)=>s+Number(r.distance),0); }
function sleepDuration(bed,wake){ if(!bed||!wake) return NaN; const[bh,bm]=bed.split(':').map(Number); const[wh,wm]=wake.split(':').map(Number); let bmin=bh*60+bm,wmin=wh*60+wm; if(wmin<=bmin) wmin+=1440; return (wmin-bmin)/60; }
function waterToday(){ return state.water.entries.filter(e=>e.date===todayStr()).reduce((s,e)=>s+Number(e.amount),0); }
function mealsToday(){ const es=state.meals.entries.filter(e=>e.date===todayStr()); return {cal:es.reduce((s,e)=>s+Number(e.cal),0), protein:es.reduce((s,e)=>s+Number(e.protein),0)}; }
function billPeriodKey(bill,dateStr){ return bill.recurring==='monthly' ? dateStr.slice(0,7) : bill.dueDate; }
function billDueDateForToday(bill){
  if(bill.recurring==='monthly'){
    const day=Number(bill.dueDate.slice(8,10));
    const ym=todayStr().slice(0,7);
    const lastDay=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate();
    return ym+'-'+String(Math.min(day,lastDay)).padStart(2,'0');
  }
  return bill.dueDate;
}
function isBillPaid(bill){ const key=billPeriodKey(bill,todayStr()); return (bill.paidDates||[]).includes(key); }
function billDaysUntilDue(bill,dateStr){ const due=billDueDateForToday(bill); return (new Date(due+'T00:00:00')-new Date(dateStr+'T00:00:00'))/86400000; }
function isBillOverdue(bill){ return !isBillPaid(bill) && billDaysUntilDue(bill,todayStr())<0; }
function activeUnpaidBills(){ return state.money.bills.filter(b=>!isBillPaid(b)).map(b=>({...b,daysLeft:billDaysUntilDue(b,todayStr()),overdue:isBillOverdue(b)})).sort((a,b)=>a.daysLeft-b.daysLeft); }
function billsDueSoon(days){ return activeUnpaidBills().filter(b=>b.daysLeft>=0 && b.daysLeft<=days); }
function budgetSpent(category){ const ym=todayStr().slice(0,7); return state.money.transactions.filter(t=>t.type==='expense'&&t.category===category&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0); }
function noSpendScheduledDates(period){
  const {buckets}=periodBuckets(period); const {start,end}=bucketsDateRange(buckets); const out=new Set();
  (state.money.noSpendDays||[]).forEach(d=>{ if(d>=start&&d<=end&&d<=todayStr()) out.add(d); });
  (state.money.noSpendRules||[]).forEach(r=>{
    if(r.type!=='weekly') return;
    // A recurring rule starts on the day it was created. Never count earlier
    // dates as achieved/failed just because the rule exists now.
    const ruleStart=r.startDate||r.createdAt||todayStr();
    buckets.flat().forEach(d=>{
      if(d<start||d>end||d>todayStr()||d<ruleStart) return;
      const dow=new Date(d+'T00:00:00').getDay(); if(dow===Number(r.day)) out.add(d);
    });
  });
  return [...out].sort();
}
function isNoSpendDay(dateStr){ return (state.money.noSpendDays||[]).includes(dateStr) || (state.money.noSpendRules||[]).some(r=>r.type==='weekly' && Number(r.day)===new Date(dateStr+'T00:00:00').getDay()); }
function noSpendAchieved(dateStr){ return !state.money.transactions.some(t=>t.date===dateStr && t.type==='expense'); }
function todayCategory(){ const dow=new Date().getDay(); return state.workout.schedule[dow] || null; }
function exercisesForDate(dateStr){ return state.workout.exerciseLogs.filter(l=>l.date===dateStr); }
function monthMatrix(year,month){ const first=new Date(year,month,1); const startDay=first.getDay(); const days=new Date(year,month+1,0).getDate(); const cells=[]; for(let i=0;i<startDay;i++) cells.push(null); for(let d=1;d<=days;d++) cells.push(d); while(cells.length%7!==0) cells.push(null); return cells; }
function dateKey(y,m,d){ return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
function activePrepsForDate(dateStr){ return (state.meals.preps||[]).filter(p=>p.start<=dateStr && dateStr<=p.end); }
function prepLogKey(dateStr,prepId){ return dateStr+'|'+prepId; }

/* ---------- shared global date filter (synced across all tabs) ---------- */
let globalPeriod='month';
function inRange(dateStr,period){
  period = period || globalPeriod;
  if(!dateStr) return period==='all';
  if(!period || period==='all') return true;
  const d=new Date(dateStr+'T00:00:00'); const now=new Date(todayStr()+'T00:00:00');
  if(period==='day') return dateStr===todayStr();
  if(period==='week'){ const dow=now.getDay(); const start=new Date(now); start.setDate(now.getDate()-dow); const end=new Date(start); end.setDate(start.getDate()+6); return d>=start && d<=end; }
  if(period==='month') return dateStr.slice(0,7)===todayStr().slice(0,7);
  if(period==='year') return dateStr.slice(0,4)===todayStr().slice(0,4);
  return true;
}
function dateFilterBar(){
  const opts=[['day','Day'],['week','Week'],['month','Month'],['year','Year'],['all','All']];
  return '<div class="filter-bar">'+opts.map(([v,l])=>'<button class="filter-btn '+(globalPeriod===v?'active':'')+'" onclick="actSetFilter(\''+v+'\')">'+l+'</button>').join('')+'</div>';
}
function actSetFilter(val){ globalPeriod=val; renderTab(); }
const DOW_LABELS=['S','M','T','W','T','F','S'];
function dowPicker(name,selectedArr){
  return '<div class="dow-picker" id="'+name+'Picker">'+DOW_LABELS.map((l,i)=>'<button type="button" class="dow-chip '+(selectedArr.includes(i)?'on':'')+'" data-dow="'+i+'" onclick="this.classList.toggle(\'on\')">'+l+'</button>').join('')+'</div>';
}
function readDowPicker(name){ const el=document.getElementById(name+'Picker'); if(!el) return [0,1,2,3,4,5,6]; return [...el.querySelectorAll('.dow-chip.on')].map(b=>Number(b.dataset.dow)); }

/* ---------- period buckets + reusable series/chart helpers ---------- */
function periodBuckets(period){
  period = period || globalPeriod;
  if(period==='day'){
    const d=todayStr();
    return {labels:[fmtDateShort(d)], buckets:[[d]], granularity:'day'};
  }
  if(period==='week'){
    const dates=last7Dates();
    return {labels:dates.map(d=>new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'narrow'})), buckets:dates.map(d=>[d]), granularity:'day'};
  }
  if(period==='month'){
    const ym=todayStr().slice(0,7);
    const daysInMonth=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate();
    const todayDay=Number(todayStr().slice(8,10));
    const dates=[]; for(let d=1; d<=Math.min(todayDay,daysInMonth); d++) dates.push(ym+'-'+String(d).padStart(2,'0'));
    return {labels:dates.map(d=>d.slice(8,10)), buckets:dates.map(d=>[d]), granularity:'day'};
  }
  // 'year' and 'all' -> monthly buckets across the current year up to the current month
  const year=Number(todayStr().slice(0,4)); const curMonth=Number(todayStr().slice(5,7));
  const labels=[],buckets=[];
  for(let mo=1; mo<=curMonth; mo++){
    const ym=year+'-'+String(mo).padStart(2,'0');
    const daysInMonth=new Date(year,mo,0).getDate();
    const dates=[]; for(let d=1; d<=daysInMonth; d++) dates.push(ym+'-'+String(d).padStart(2,'0'));
    labels.push(new Date(ym+'-01T00:00:00').toLocaleDateString('en-US',{month:'short'}));
    buckets.push(dates);
  }
  return {labels,buckets,granularity:'month'};
}
function sumByBuckets(items,dateField,valueFn,buckets){
  return buckets.map(bucketDates=>{
    const set=new Set(bucketDates);
    return items.filter(it=>set.has(it[dateField])).reduce((s,it)=>s+valueFn(it),0);
  });
}
function bucketsDateRange(buckets){
  const flat=buckets.flat();
  return {start:flat[0]||todayStr(), end:flat[flat.length-1]||todayStr()};
}
function donutChartSVG(labels,values,colors){
  const w=260,h=Math.max(110,24*labels.length+20),cx=68,cy=h/2,r=52,rInner=30;
  const total=values.reduce((a,b)=>a+(Number(b)||0),0);
  let angle=-Math.PI/2;
  let svg='<svg viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:280px;height:auto">';
  if(!total){
    svg+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="var(--surface-2)"/><circle cx="'+cx+'" cy="'+cy+'" r="'+rInner+'" fill="var(--surface)"/><text x="'+cx+'" y="'+(cy+4)+'" text-anchor="middle" font-size="10.5" fill="var(--text-faint)" font-family="var(--font-mono)">No data</text>';
  } else {
    values.forEach((v,i)=>{
      const frac=(Number(v)||0)/total; if(frac<=0) return;
      const end=angle+frac*Math.PI*2;
      const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
      const x2=cx+r*Math.cos(end), y2=cy+r*Math.sin(end);
      const large=frac>0.5?1:0;
      svg+='<path d="M'+cx+' '+cy+' L'+x1.toFixed(2)+' '+y1.toFixed(2)+' A'+r+' '+r+' 0 '+large+' 1 '+x2.toFixed(2)+' '+y2.toFixed(2)+' Z" fill="'+colors[i%colors.length]+'"/>';
      angle=end;
    });
    svg+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rInner+'" fill="var(--surface)"/><text x="'+cx+'" y="'+(cy+4)+'" text-anchor="middle" font-size="12" fill="var(--text)" font-family="var(--font-mono)" font-weight="700">'+total+'</text>';
  }
  labels.forEach((lab,i)=>{
    const ly=22+i*22;
    svg+='<rect x="150" y="'+(ly-9)+'" width="10" height="10" rx="2" fill="'+colors[i%colors.length]+'"/><text x="166" y="'+ly+'" font-size="9.5" fill="var(--text-dim)" font-family="var(--font-body)">'+esc(lab)+' ('+(values[i]||0)+')</text>';
  });
  svg+='</svg>';
  return svg;
}
function miniBarChartHtml(labels,values,colors){
  const max=Math.max(1,...values.map(v=>Number(v)||0));
  return '<div class="bar-chart">'+labels.map((lab,i)=>'<div class="bar-col"><div class="bar" style="height:'+Math.max(4,(Number(values[i])||0)/max*100)+'px;background:'+colors[i%colors.length]+'"></div><div class="bar-label mono">'+(values[i]||0)+'</div><div class="bar-label">'+esc(lab)+'</div></div>').join('')+'</div>';
}
function moneyIncExpSeries(period){
  const {labels,buckets}=periodBuckets(period);
  const inc=sumByBuckets(state.money.transactions.filter(t=>t.type==='income'),'date',t=>Number(t.amount),buckets);
  const exp=sumByBuckets(state.money.transactions.filter(t=>t.type==='expense'),'date',t=>Number(t.amount),buckets);
  return {labels,series:[{name:'Income',color:'var(--c-sage)',values:inc},{name:'Expenses',color:'var(--c-coral)',values:exp}]};
}
function billsPieData(period){
  const {buckets}=periodBuckets(period);
  const {start,end}=bucketsDateRange(buckets);
  let onTime=0,late=0;
  state.money.bills.forEach(b=>(b.paymentMeta||[]).forEach(m=>{ if(m.paidDate>=start && m.paidDate<=end){ if(m.late) late++; else onTime++; } }));
  return {labels:['On time','Late'],values:[onTime,late],colors:['var(--c-sage)','var(--c-coral)']};
}
function noSpendBarData(period){
  const days=noSpendScheduledDates(period);
  const followed=days.filter(d=>noSpendAchieved(d)).length;
  const missed=days.length-followed;
  return {labels:['Achieved','Failed'],values:[followed,missed],colors:['var(--c-sage)','var(--c-coral)']};
}
function tradingPLSeries(period){
  const {labels,buckets}=periodBuckets(period);
  const pl=sumByBuckets(state.trading.trades.map(t=>({date:t.date,pl:tradePL(t)})),'date',x=>x.pl,buckets);
  return {labels,series:[{name:'P/L',color:'var(--c-coral)',values:pl}]};
}
function runningDistanceSeries(period){
  const {labels,buckets}=periodBuckets(period);
  const dist=sumByBuckets(state.running.runs,'date',r=>Number(r.distance),buckets);
  return {labels,series:[{name:'Distance (km)',color:'var(--c-sage)',values:dist}]};
}
function habitStreakSeries(habitId,period){
  const h=state.habits.habits.find(x=>x.id===habitId);
  if(!h) return {labels:[],values:[]};
  const days=h.days||[0,1,2,3,4,5,6];
  const {buckets,labels,granularity}=periodBuckets(period);
  let scheduled=[];
  buckets.forEach(b=>b.forEach(d=>{ if(d<=todayStr() && days.includes(new Date(d+'T00:00:00').getDay())) scheduled.push(d); }));
  scheduled.sort();
  let streak=0; const streakAt={};
  scheduled.forEach(d=>{ const done=!!(state.habits.logs[d]&&state.habits.logs[d][habitId]); streak=done?streak+1:0; streakAt[d]=streak; });
  if(granularity==='day'){
    return {labels:scheduled.map(d=>fmtDateShort(d)), values:scheduled.map(d=>streakAt[d])};
  }
  const values=buckets.map(bucketDates=>{
    const inBucket=bucketDates.filter(d=>scheduled.includes(d));
    if(!inBucket.length) return null;
    return streakAt[inBucket[inBucket.length-1]];
  });
  return {labels,values};
}

/* ---------- simple SVG line chart ---------- */
function lineChartSVG(seriesList,xLabels,opts){
  opts=opts||{};
  const w=760,h=250,padL=72,padR=18,padT=18,padB=38;
  const allVals=seriesList.flatMap(s=>s.values.filter(v=>v!=null));
  let max=Math.max(1,...allVals), min=Math.min(0,...allVals);
  if(max===min) max=min+1;
  const n=xLabels.length;
  const xAt=i=> n<=1 ? padL : padL + (i*(w-padL-padR)/(n-1));
  const yAt=v=> padT + (1-((v-min)/(max-min)))*(h-padT-padB);
  let svg='<svg viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">';
  for(let g=0; g<=3; g++){ const gy=padT+g*(h-padT-padB)/3; svg+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(w-padR)+'" y2="'+gy+'" stroke="var(--border-soft)" stroke-width="1"/>'; const val=max-(g*(max-min)/3); svg+='<text x="'+(padL-8)+'" y="'+(gy+3)+'" text-anchor="end" font-size="12" fill="var(--text-faint)" font-family="var(--font-mono)">'+(opts.yFormat?opts.yFormat(val):Math.round(val))+'</text>'; }
  xLabels.forEach((lb,i)=>{ if(n>8 && i%Math.ceil(n/8)!==0) return; svg+='<text x="'+xAt(i)+'" y="'+(h-8)+'" text-anchor="middle" font-size="12" fill="var(--text-faint)" font-family="var(--font-mono)">'+esc(lb)+'</text>'; });
  seriesList.forEach(s=>{
    const pts=s.values.map((v,i)=>v==null?null:[xAt(i),yAt(v)]).filter(Boolean);
    if(pts.length){
      const path=pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
      svg+='<path d="'+path+'" fill="none" stroke="'+s.color+'" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(p=>{ svg+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.75" fill="'+s.color+'"/>'; });
    }
  });
  svg+='</svg>';
  return svg;
}
function chartLegend(seriesList){ return '<div class="legend">'+seriesList.map(s=>'<span><span class="legend-swatch" style="background:'+s.color+'"></span>'+esc(s.name)+'</span>').join('')+'</div>'; }

/* ---------- app / nav state ---------- */
let currentTab='home';
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth(), calSelected=todayStr();
let sw={elapsed:0,running:false,intervalId:null,startTs:0};
let cd={remaining:0,total:0,running:false,intervalId:null};
let dashExCategory=null, dashExExercise=null;
let workoutExCatFilter='';
let groceryDateFilter=todayStr();
let reportPeriod='month';
let reportMonth=todayStr().slice(0,7);
let dashHabitId=null, habitsChartId=null;
const appSettings={defaultTab:'home',currency:'PHP',confirmDeletes:true};


function iconSvg(name){
  const paths={
    House:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
    LayoutDashboard:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    Wallet:'<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 7h13"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z"/>',
    ChartNoAxesCombined:'<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-5 3 3 5-7"/>',
    CheckCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    Footprints:'<path d="M8 4c-1.2 1.2-1.5 3.3-.7 5.2.7 1.6 2 2.5 3.2 2.1 1.3-.4 1.5-2.2.9-4.1C10.8 5.1 9.2 3.3 8 4Z"/><path d="M15.7 11.8c-1.1.5-1.8 2.2-1.5 4.1.3 1.8 1.5 3.4 2.9 3.4 1.3 0 2.1-1.6 1.8-3.5-.3-2.1-2-4.5-3.2-4Z"/>',
    Dumbbell:'<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M6 12h12"/>',
    Utensils:'<path d="M7 3v7"/><path d="M4 3v5a3 3 0 0 0 6 0V3"/><path d="M7 11v10"/><path d="M17 3v18"/><path d="M17 3c3 2 3 6 0 8"/>',
    Moon:'<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
    Droplets:'<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z"/><path d="M9.5 15.5a3 3 0 0 0 3 2"/>',
    ListTodo:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M8 17h7"/>',
    CalendarDays:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    BookOpen:'<path d="M3 5.5A3.5 3.5 0 0 1 6.5 2H12v18H6.5A3.5 3.5 0 0 0 3 23Z"/><path d="M21 5.5A3.5 3.5 0 0 0 17.5 2H12v18h5.5A3.5 3.5 0 0 1 21 23Z"/>',
    NotebookPen:'<path d="M4 4h10"/><path d="M4 8h7"/><path d="M4 12h7"/><path d="M4 16h6"/><path d="M4 20h5"/><path d="m16 13 4 4-5 5-4 1 1-4Z"/>',
    ShoppingCart:'<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.5 11h10l2-8H6"/>',
    UserRound:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' ,
    MessagesSquare:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H11l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 12.5z"/><path d="M8 8h8M8 11h5"/>'
  };
  return '<svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.LayoutDashboard)+'</svg>';
}

const TAB_SECTIONS=[
  {label:'HOME',tabs:[
    {id:'home',icon:'House',label:'Home',color:'var(--c-amber)'},
    {id:'dashboard',icon:'LayoutDashboard',label:'Dashboard',color:'var(--c-amber)'},
    {id:'messages',icon:'MessagesSquare',label:'Messages',color:'var(--c-amber)'},
  ]},
  {label:'FINANCE',tabs:[
    {id:'money',icon:'Wallet',label:'Money',color:'var(--c-amber)'},
    {id:'trading',icon:'ChartNoAxesCombined',label:'Trading',color:'var(--c-amber)'},
  ]},
  {label:'HEALTH',tabs:[
    {id:'habits',icon:'CheckCircle',label:'Habits',color:'var(--c-amber)'},
    {id:'running',icon:'Footprints',label:'Running',color:'var(--c-amber)'},
    {id:'workout',icon:'Dumbbell',label:'Workout',color:'var(--c-amber)'},
    {id:'meals',icon:'Utensils',label:'Meals',color:'var(--c-amber)'},
    {id:'sleepwater',icon:'Moon',label:'Sleep & Water',color:'var(--c-amber)'},
  ]},
  {label:'LIFE',tabs:[
    {id:'calendar',icon:'CalendarDays',label:'Calendar',color:'var(--c-amber)'},
    {id:'reading',icon:'BookOpen',label:'Reading',color:'var(--c-amber)'},
    {id:'journal',icon:'NotebookPen',label:'Journal',color:'var(--c-amber)'},
    {id:'groceries',icon:'ShoppingCart',label:'Groceries',color:'var(--c-amber)'},
  ]},
];
const TABS=TAB_SECTIONS.flatMap(section=>section.tabs);
const CURRENT_TAB_KEY='ledger_current_tab_v1';
function restoreCurrentTab(){
  try{
    const saved=localStorage.getItem(CURRENT_TAB_KEY);
    if(saved && TABS.some(t=>t.id===saved)) currentTab=saved;
    else if(appSettings.defaultTab && TABS.some(t=>t.id===appSettings.defaultTab)) currentTab=appSettings.defaultTab;
  }catch(e){}
}
function persistCurrentTab(){ try{ localStorage.setItem(CURRENT_TAB_KEY,currentTab); }catch(e){} }

const appRoot=document.getElementById('app');

function renderShell(){
  appRoot.innerHTML =
    '<div class="sidebar">'+
      '<div class="brand"><span class="brand-mark"><img src="./assets/icons/icon-192.png" alt="Life Management"></span><div><div class="brand-title">Life Management</div><div class="brand-sub">life, tracked</div></div></div>'+
      '<div class="tabs">'+TAB_SECTIONS.map(section=>
        '<div class="tab-section">'+
          '<div class="tab-section-label">'+section.label+'</div>'+
          section.tabs.map(t=>'<button class="tab-btn '+(t.id===currentTab?'active':'')+'" data-tab="'+t.id+'" style="--tab-color:'+t.color+'">'+iconSvg(t.icon)+'<span class="lbl">'+t.label+'</span></button>').join('')+
        '</div>'
      ).join('')+'</div>'+
      '<div style="margin-top:auto;padding:12px;border-top:1px solid var(--border-soft)">'+
        '<button class="tab-btn" onclick="openAccountPanel()">'+iconSvg('UserRound')+'<span class="lbl">Account</span></button>'+
      '</div>'+
    '</div>'+
    ''+
    '<div class="main" id="main"></div>';
  [...appRoot.querySelectorAll('.tab-btn')].forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); currentTab=b.dataset.tab; persistCurrentTab(); closeSidebar(); renderShell(); }));
  const tt=document.getElementById('topbarTitle'); if(tt){ const t=TABS.find(x=>x.id===currentTab); tt.textContent=t?t.label:'Life Management'; }
  syncSidebar();
  renderTab();
}
function navigateToTab(tab){
  if(!TABS.some(t=>t.id===tab)) return;
  currentTab=tab;
  persistCurrentTab();
  closeSidebar();
  renderShell();
}
function homeNavButton(tab,label){
  return '<button class="home-nav-btn" type="button" title="Go to '+esc(label)+'" aria-label="Go to '+esc(label)+'" data-home-nav="'+esc(tab)+'">↗</button>';
}
function homeCardTitle(title,tab,label){
  return '<div class=\"card-head-row home-card-head\"><div class=\"card-title\">'+title+'</div>'+homeNavButton(tab,label)+'</div>';
}
function renderTab(){ if(currentTab==='messages'){ renderMessagesAsync(); return; } (RENDERERS[currentTab]||renderHome)(); }

/* ---------- PHONE NOTIFICATIONS ---------- */
const HOME_NOTIFICATION_KEY='__ledger_home_notifications_v2';
const HOME_NOTIFICATION_COOLDOWN=24*60*60*1000;
function notificationSupported(){ return 'Notification' in window; }
async function requestHomeNotificationPermission(){
  if(!notificationSupported()) throw new Error('Notifications are not supported on this device/browser.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted') throw new Error('Notification permission was not granted.');
  return permission;
}
async function enableHomeNotifications(){
  try{ await requestHomeNotificationPermission(); await sendHomeNotifications(true); openModal('Phone Notifications','<div class="form-col"><div class="sync-note">Phone notifications are enabled for Home items. Vitals are excluded.</div><button class="btn btn-primary" onclick="closeModal()">Done</button></div>'); }
  catch(e){ openModal('Phone Notifications','<div class="form-col"><div class="sync-note">'+esc(e.message||'Could not enable notifications.')+'</div><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>'); }
}
async function showPhoneNotification(title,body,tag){
  if(!notificationSupported() || Notification.permission!=='granted') return;
  try{ const reg=navigator.serviceWorker?.controller?await navigator.serviceWorker.ready:null; if(reg) await reg.showNotification(title,{body,tag,icon:'./assets/icons/icon-192.png',badge:'./assets/icons/icon-192.png',data:{url:window.location.href},renotify:false}); else new Notification(title,{body,tag,renotify:false}); }
  catch(e){ console.warn('[Life Management Notifications]',e); }
}
function homeNotificationItems(){
  const today=todayStr(), dow=new Date().getDay(), items=[];
  (state.calendar.events||[]).filter(e=>e.date===today).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')).forEach(e=>{
    const label=e.category||'Event';
    if(e.category==='Task' && e.done) return;
    items.push({id:'calendar:'+e.id,title:label+' today',body:(e.time?e.time+' · ':'')+e.title});
  });
  const cat=todayCategory(); if(cat) items.push({id:'training:'+today,title:'Training today',body:cat});
  state.habits.habits.filter(h=>(h.days||[0,1,2,3,4,5,6]).includes(dow)).forEach(h=>{const done=!!(state.habits.logs[today]&&state.habits.logs[today][h.id]);if(!done)items.push({id:'habit:'+h.id,title:'Habit pending',body:h.name});});
  activePrepsForDate(today).forEach(p=>{const x=state.meals.prepLogs[prepLogKey(today,p.id)],status=typeof x==='string'?x:x&&x.status;if(status!=='yes')items.push({id:'mealprep:'+p.id,title:'Meal prep today',body:p.name+(p.category?' · '+p.category:'')});});
  activeUnpaidBills().forEach(b=>items.push({id:'bill:'+b.id,title:b.overdue?'Bill overdue':'Bill reminder',body:b.name+' · '+fmtMoney(b.amount)+(b.overdue?'':' · '+(b.daysLeft===0?'due today':'due in '+Math.round(b.daysLeft)+'d'))}));
  if(isNoSpendDay(today))items.push({id:'nospend:'+today,title:'No-spend day',body:noSpendAchieved(today)?'Keep it up — no spending logged today.':'Avoid spending today.'});
  state.money.budgets.filter(b=>budgetSpent(b.category)>b.limit).forEach(b=>items.push({id:'budget:'+b.id,title:'Budget exceeded',body:b.category+' · '+fmtMoney(budgetSpent(b.category))+' / '+fmtMoney(b.limit)}));
  return items;
}
async function sendHomeNotifications(force=false){
  if(!supabaseUser||!notificationSupported()||Notification.permission!=='granted')return; const items=homeNotificationItems();if(!items.length)return;
  let sent={};try{const r=await window.storage.get(HOME_NOTIFICATION_KEY,false);sent=r?JSON.parse(r.value):{};}catch(e){}
  const now=Date.now(); for(const item of items){const key=todayStr()+'|'+item.id;if(!force&&sent[key]&&now-sent[key]<HOME_NOTIFICATION_COOLDOWN)continue;await showPhoneNotification(item.title,item.body,'home-'+item.id);sent[key]=now;}
  const cutoff=now-7*24*60*60*1000;Object.keys(sent).forEach(k=>{if(Number(sent[k])<cutoff)delete sent[k];});try{await window.storage.set(HOME_NOTIFICATION_KEY,JSON.stringify(sent),false);}catch(e){}
}
function scheduleHomeNotifications(){if(supabaseUser)setTimeout(()=>sendHomeNotifications(false),900);}

/* ---------- HOME (read-only) ---------- */
function mealPrepTodayHomeCardHtml(){
  const preps=activePrepsForDate(todayStr()).filter(p=>{ const x=state.meals.prepLogs[prepLogKey(todayStr(),p.id)]; return !(x && ((typeof x==='string'?x:x.status)==='yes')); });
  if(!preps.length) return '<div class="card">'+homeCardTitle('Meal Prep Today','meals','Meals')+'<div class="empty">No meal prep plan active today.</div></div>';
  return '<div class="card">'+homeCardTitle('Meal Prep Today','meals','Meals')+'<div class="life-management-list">'+preps.map(p=>'<div class="life-management-row" style="flex-wrap:wrap;gap:7px"><span class="badge badge-low">'+esc(p.category)+'</span><span class="ev-title">'+esc(p.name)+'</span><span class="prep-macros mono text-faint">'+Number(p.cal||0)+' kcal · '+Number(p.protein||0)+'g</span></div>').join('')+'</div></div>';
}
function mealPrepTodayCardHtml(){
  const preps=activePrepsForDate(todayStr()).filter(p=>{ const x=state.meals.prepLogs[prepLogKey(todayStr(),p.id)]; return !(x && ((typeof x==='string'?x:x.status)==='yes')); });
  if(!preps.length) return '<div class="card"><div class="card-title">Meal Prep Today</div><div class="empty">No meal prep plan active today.</div></div>';
  return '<div class="card"><div class="card-title">Meal Prep Today</div><div class="life-management-list">'+preps.map(p=>{ const log=state.meals.prepLogs[prepLogKey(todayStr(),p.id)]; const status=typeof log==='string'?log:log&&log.status; return '<div class="life-management-row" style="flex-wrap:wrap;gap:7px"><span class="badge badge-low">'+esc(p.category)+'</span><span class="ev-title">'+esc(p.name)+'</span><span class="prep-macros mono text-faint">'+Number(p.cal||0)+' kcal · '+Number(p.protein||0)+'g</span><span class="prep-choice"><button class="btn '+(status==='yes'?'btn-primary':'btn-ghost')+'" onclick="actSetPrepLog(\''+p.id+'\',\'yes\')">Yes</button><button class="btn '+(status==='no'?'btn-primary':'btn-ghost')+'" onclick="actSetPrepLog(\''+p.id+'\',\'no\')">No</button></span></div>'; }).join('')+'</div></div>';
}

function renderHome(){
  const main=document.getElementById('main');
  const today=todayStr();
  const todayDow=new Date().getDay();
  const todayPlans=(state.calendar.events||[]).filter(e=>e.date===today).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
  const habitsToday=state.habits.habits.filter(h=>(h.days||[0,1,2,3,4,5,6]).includes(todayDow)).map(h=>({...h,done:!!(state.habits.logs[today]&&state.habits.logs[today][h.id])}));
  const water=waterToday();
  const lastSleep=[...state.sleep.entries].sort((a,b)=>b.date.localeCompare(a.date))[0];
  const sleepHrs=lastSleep? sleepDuration(lastSleep.bed,lastSleep.wake) : null;
  const sleepGoal=state.sleep.goalHours||8;
  const cal=mealsToday();
  const mealsTodayList=state.meals.entries.filter(e=>e.date===today);
  const cat=todayCategory();
  const dueBills=billsDueSoon(0);
  const upcomingBills=billsDueSoon(3).filter(b=>b.daysLeft>0);
  const overBudgets=state.money.budgets.filter(b=>budgetSpent(b.category)>b.limit);
  const nsToday=isNoSpendDay(today);

  main.innerHTML =
   '<div class="today-hero"><div class="hero-eyebrow">Today</div><div class="hero-date">'+fmtDateLong(today)+'</div><div class="hero-rule"></div></div>'+
   '<div class="home-grid">'+
     '<div class="card">'+homeCardTitle('Today','calendar','Calendar')+
       (todayPlans.length? '<div class="life-management-list">'+todayPlans.map(e=>{const completed=(e.category==='Task'||e.category==='Errands')&&!!e.done;return '<div class="life-management-row"'+(completed?' style="opacity:.65"':'')+'><span class="badge badge-'+(e.category==='Task'?'medium':e.category==='Errands'?'low':e.category==='Reminder'?'high':'done')+'">'+esc(e.category||'Event')+'</span><span class="mono" style="color:var(--c-blue)">'+(e.time||'--:--')+'</span><span class="ev-title" style="'+(completed?'text-decoration:line-through;':'')+'">'+esc(e.title)+'</span></div>'}).join('')+'</div>' : '<div class="empty">Nothing scheduled today.</div>')+
     '</div>'+
         '<div class="card">'+homeCardTitle('Training Today','workout','Workout')+
       (cat? '<div class="life-management-row"><span class="badge badge-low">'+esc(cat)+'</span></div>' : '<div class="empty">No training category set for today. Configure it in Workout → Schedule.</div>')+
     '</div>'+
    
     
     '<div class="card">'+homeCardTitle('Habits Today','habits','Habits')+
       (habitsToday.length? '<div class="life-management-list">'+habitsToday.map(h=>'<div class="life-management-row"><span class="ev-title">'+esc(h.name)+'</span><span class="badge '+(h.done?'badge-done':'badge-pending')+'">'+(h.done?'Done':'Pending')+'</span></div>').join('')+'</div>' : '<div class="empty">No habits scheduled today.</div>')+
     '</div>'+
     mealPrepTodayHomeCardHtml()+
     '<div class="card">'+homeCardTitle('Bills','money','Money')+
       (activeUnpaidBills().length? '<div class="life-management-list">'+activeUnpaidBills().map(b=>'<div class="life-management-row"><span class="ev-title">'+esc(b.name)+'</span><span class="mono text-coral">'+fmtMoney(b.amount)+'</span><span class="badge '+(b.overdue?'badge-high':'badge-pending')+'">'+(b.overdue?'Late · '+Math.abs(Math.round(b.daysLeft))+'d':'Due '+(b.daysLeft===0?'today':'in '+Math.round(b.daysLeft)+'d') )+'</span></div>').join('')+'</div>' : '<div class="empty">No unpaid bills. Add a new bill when one arrives.</div>')+
     '</div>'+
     '<div class="card">'+homeCardTitle('Other Reminders','money','Money')+(function(){
       const items=[];
       if(nsToday) items.push({color:noSpendAchieved(today)?'var(--c-sage)':'var(--c-amber)', text:'No-spend day'+(noSpendAchieved(today)?' — achieved so far, keep it up!':' — avoid spending today.')});
       overBudgets.forEach(b=>items.push({color:'var(--c-coral)', text:'Over budget on "'+esc(b.category)+'" ('+fmtMoney(budgetSpent(b.category))+' / '+fmtMoney(b.limit)+')'}));
       if(!items.length) return '<div class="empty">Nothing else to flag today.</div>';
       return '<div class="life-management-list">'+items.map(it=>'<div class="reminder-row"><span class="reminder-dot" style="background:'+it.color+'"></span><span class="ev-title">'+it.text+'</span></div>').join('')+'</div>';
     })()+
     '</div>'+
      '<div class="card">'+homeCardTitle('Vitals','sleepwater','Sleep & Water')+'<div class="vitals">'+
       '<div class="vital"><div class="vital-label">Water</div><div class="mono vital-value">'+water+' / '+state.water.goal+' ml</div>'+progressBar(water/state.water.goal*100,'var(--c-blue)')+'</div>'+
       '<div class="vital"><div class="vital-label">Sleep last night</div><div class="mono vital-value">'+(sleepHrs!==null? sleepHrs.toFixed(1)+' h' : '--')+' <span class="badge '+(sleepHrs!==null&&sleepHrs>=sleepGoal?'badge-done':'badge-pending')+'">'+(sleepHrs===null?'No data':(sleepHrs>=sleepGoal?'Goal reached':'Short by '+(sleepGoal-sleepHrs).toFixed(1)+'h'))+'</span></div></div>'+
       '<div class="vital"><div class="vital-label">Calories today</div><div class="mono vital-value">'+cal.cal+' / '+state.meals.goal.cal+' kcal</div>'+progressBar(cal.cal/state.meals.goal.cal*100,'var(--c-sage)')+'</div>'+
       '<div class="vital"><div class="vital-label">Protein today</div><div class="mono vital-value">'+cal.protein+' / '+state.meals.goal.protein+' g</div>'+progressBar(cal.protein/state.meals.goal.protein*100,'var(--c-amber)')+'</div>'+
     '</div></div>'+
   '</div>'+
   '<div class="home-note">This page is a read-only summary — manage items from their own tabs.</div>';
  main.querySelectorAll('[data-home-nav]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      navigateToTab(btn.dataset.homeNav);
    });
  });
  scheduleHomeNotifications();
}

/* ---------- DASHBOARD ---------- */
function dashboardWorkoutScheduledDates(period,category){
  const {buckets}=periodBuckets(period); const dates=[]; const plans=(state.workout.exercisePlans||[]).filter(p=>p.category===category);
  const planDays=new Set(plans.flatMap(p=>p.weekdays||[]));
  buckets.flat().forEach(d=>{
    if(d>todayStr()) return;
    const dow=new Date(d+'T00:00:00').getDay();
    const scheduledByPlan=planDays.size ? planDays.has(dow) : state.workout.schedule[dow]===category;
    if(scheduledByPlan && !/rest/i.test(category||'')) dates.push(d);
  });
  return [...new Set(dates)].sort();
}
function dashboardWorkoutDoneDates(category){
  const done=new Set();
  (state.workout.exercisePlans||[]).filter(p=>p.category===category).forEach(p=>(p.actuals||[]).forEach(a=>{
    if(Number(a.sets||0)>0) done.add(a.date);
  }));
  return done;
}
function dashboardWorkoutStreakSeries(period,category){
  const {labels,buckets}=periodBuckets(period);
  const scheduled=dashboardWorkoutScheduledDates(period,category);
  const done=dashboardWorkoutDoneDates(category); let streak=0; const streakAt={};
  scheduled.forEach(d=>{ streak=done.has(d)?streak+1:0; streakAt[d]=streak; });
  const values=buckets.map(ds=>{
    const inBucket=ds.filter(d=>scheduled.includes(d));
    if(!inBucket.length) return null;
    return streakAt[inBucket[inBucket.length-1]];
  });
  return {labels,values};
}
function dashboardWorkoutProgress(period,category){
  const {labels,buckets}=periodBuckets(period); const byDate={};
  (state.workout.exercisePlans||[]).filter(p=>p.category===category).forEach(p=>(p.actuals||[]).forEach(a=>{
    if(!inRange(a.date,period)||a.date>todayStr()) return;
    if(!byDate[a.date]) byDate[a.date]={w:[],s:[],r:[]};
    if(Number(a.weight||0)>0) byDate[a.date].w.push(Number(a.weight));
    if(Number(a.sets||0)>0) byDate[a.date].s.push(Number(a.sets));
    if(Number(a.reps||0)>0) byDate[a.date].r.push(Number(a.reps));
  }));
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  return {labels,
    weight:buckets.map(ds=>{const a=ds.flatMap(d=>(byDate[d]?.w)||[]);return avg(a)}),
    sets:buckets.map(ds=>{const a=ds.flatMap(d=>(byDate[d]?.s)||[]);return avg(a)}),
    reps:buckets.map(ds=>{const a=ds.flatMap(d=>(byDate[d]?.r)||[]);return avg(a)})};
}
function dashboardPrepPie(period){
  const {buckets}=periodBuckets(period); let eaten=0,missed=0;
  for(const d of buckets.flat().filter(x=>x<=todayStr())){
    (state.meals.preps||[]).filter(p=>p.start<=d&&d<=p.end).forEach(p=>{
      const l=state.meals.prepLogs[prepLogKey(d,p.id)],st=typeof l==='string'?l:l&&l.status;
      if(st==='yes') eaten++; else if(st==='no' || d<todayStr()) missed++;
    });
  }
  return {labels:['Followed','Missed'],values:[eaten,missed],colors:['var(--c-sage)','var(--c-coral)']};
}

function dashboardMealSeries(period){
  const {labels,buckets}=periodBuckets(period);
  return {
    labels,
    cal:sumByBuckets(state.meals.entries,'date',e=>Number(e.cal||0),buckets),
    protein:sumByBuckets(state.meals.entries,'date',e=>Number(e.protein||0),buckets)
  };
}
function dashboardSleepSeries(period){
  const {labels,buckets}=periodBuckets(period);
  return {labels,values:buckets.map(ds=>{
    const a=state.sleep.entries.filter(e=>ds.includes(e.date)&&e.bed&&e.wake);
    if(!a.length) return null;
    const hrs=a.map(e=>sleepDuration(e.bed,e.wake)).filter(Number.isFinite);
    return hrs.length?hrs.reduce((sum,v)=>sum+v,0)/hrs.length:null;
  })};
}
function dashboardWaterSeries(period){
  const {labels,buckets}=periodBuckets(period);
  return {labels,values:buckets.map(ds=>state.water.entries.filter(e=>ds.includes(e.date)).reduce((s,e)=>s+Number(e.amount||0),0))};
}
function dashboardReadingSeries(period){
  const {labels,buckets}=periodBuckets(period);
  return {labels,values:buckets.map(ds=>state.reading.books.filter(b=>b.status==='done'&&ds.includes(b.addedDate||'')).length)};
}
function dashboardEventSeries(period){
  const {labels,buckets}=periodBuckets(period);
  return {labels,values:buckets.map(ds=>state.calendar.events.filter(e=>ds.includes(e.date)).length)};
}
function dashboardGrocerySeries(period){
  const {labels,buckets}=periodBuckets(period);
  return {labels,values:sumByBuckets(state.groceries.items,'date',g=>Number(g.price||g.amount||0),buckets)};
}

function dashboardBodyWeightSeries(period){
  // Use the exact same date buckets/axis as the other dashboard line charts.
  // Weight entries remain daily in the underlying data; when the selected
  // dashboard range is monthly/yearly, show the latest logged weight in each
  // chart bucket rather than inventing/interpolating values.
  const {labels,buckets}=periodBuckets(period);
  const weights=(state.workout.bodyWeights||[])
    .filter(w=>w.date&&w.weight!=null)
    .sort((a,b)=>a.date.localeCompare(b.date));
  const values=buckets.map(bucketDates=>{
    const start=bucketDates[0], end=bucketDates[bucketDates.length-1];
    const inBucket=weights.filter(w=>w.date>=start&&w.date<=end);
    return inBucket.length ? Number(inBucket[inBucket.length-1].weight) : null;
  });
  return {labels,values};
}
function renderDashboard(){
  const main=document.getElementById('main');
  const period=globalPeriod;

  const selectedTxns=state.money.transactions.filter(t=>inRange(t.date,period));
  const inc=selectedTxns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp=selectedTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const totalPL=state.trading.trades.filter(t=>inRange(t.date,period)).reduce((s,t)=>s+tradePL(t),0);
  const money=moneyIncExpSeries(period);
  const categories=state.workout.categories||[];
  const workoutCategory=categories.find(c=>!(/rest/i.test(c||'')))||categories[0]||'';
  const workoutCat=window.dashWorkoutCategory!==undefined && categories.includes(window.dashWorkoutCategory)?window.dashWorkoutCategory:workoutCategory;
  window.dashWorkoutCategory=workoutCat;
  const streak=dashboardWorkoutStreakSeries(period,workoutCat);
  const progress=dashboardWorkoutProgress(period,workoutCat);
  const bodyWeight=dashboardBodyWeightSeries(period);
  const prep=dashboardPrepPie(period);
  const meal=dashboardMealSeries(period);
  const sleep=dashboardSleepSeries(period);
  const water=dashboardWaterSeries(period);
  const reading=dashboardReadingSeries(period);
  const grocery=dashboardGrocerySeries(period);
  const trading=tradingPLSeries(period);

  const prepTotal=prep.values.reduce((a,b)=>a+b,0);

  main.innerHTML=
    '<div class="page-head"><div class="page-quote">The whole picture.</div></div>'+
    dateFilterBar()+
    '<div class="dashboard-section"><div class="dashboard-section-title">Money</div>'+
      '<div class="card-grid stat-grid dash-grid">'+
        statCard('Balance',fmtMoney(totalBalance()),'','var(--c-amber)')+
        statCard('Net',fmtMoney(inc-exp),'',(inc-exp)>=0?'var(--c-sage)':'var(--c-coral)')+
        statCard('Trading P/L',fmtUSD(totalPL),'',totalPL>=0?'var(--c-sage)':'var(--c-coral)')+
      '</div>'+
      '<div class="dashboard-grid dashboard-grid-2">'+
        '<div class="card chart-card"><div class="card-title">Income & Expenses</div>'+lineChartSVG(money.series,money.labels,{yFormat:v=>'₱'+Math.round(v/1000)+'k'})+chartLegend(money.series)+'</div>'+
        '<div class="card chart-card"><div class="card-title">Bills</div>'+donutChartSVG(billsPieData(period).labels,billsPieData(period).values,billsPieData(period).colors)+'</div>'+
      '</div>'+
      '<div class="card chart-card" style="margin-top:12px"><div class="card-title">No-Spend Days</div>'+donutChartSVG(noSpendBarData(period).labels,noSpendBarData(period).values,noSpendBarData(period).colors)+'</div>'+
    '</div>'+

    '<div class="dashboard-section"><div class="dashboard-section-title">Trading</div>'+
      '<div class="card chart-card">'+lineChartSVG(trading.series,trading.labels,{yFormat:v=>fmtUSD(v)})+chartLegend(trading.series)+'</div>'+
    '</div>'+

    '<div class="dashboard-section"><div class="dashboard-section-title">Workout</div>'+
      '<div class="dashboard-grid dashboard-grid-2">'+
        '<div class="card chart-card"><div class="card-head-row"><div class="card-title">Streak</div><select class="input dashboard-select" id="dashWorkoutCatSel">'+categories.map(c=>'<option value="'+esc(c)+'" '+(c===workoutCat?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+
          lineChartSVG([{name:'Streak',color:'var(--c-coral)',values:streak.values}],streak.labels,{yFormat:v=>Math.round(v)})+
        '</div>'+
        '<div class="dashboard-grid dashboard-grid-4" style="gap:10px">'+
          '<div class="card chart-card small-chart"><div class="mini-chart-title">Body Weight</div>'+lineChartSVG([{name:'Body Weight',color:'var(--c-amber)',values:bodyWeight.values}],bodyWeight.labels,{yFormat:v=>Number(v).toFixed(1)})+'</div>'+
          '<div class="card chart-card small-chart"><div class="mini-chart-title">Exercise Weight</div>'+lineChartSVG([{name:'Exercise Weight',color:'var(--c-coral)',values:progress.weight}],progress.labels,{yFormat:v=>Number(v).toFixed(1)})+'</div>'+
          '<div class="card chart-card small-chart"><div class="mini-chart-title">Sets</div>'+lineChartSVG([{name:'Sets',color:'var(--c-blue)',values:progress.sets}],progress.labels,{yFormat:v=>Number(v).toFixed(1)})+'</div>'+
          '<div class="card chart-card small-chart"><div class="mini-chart-title">Reps</div>'+lineChartSVG([{name:'Reps',color:'var(--c-sage)',values:progress.reps}],progress.labels,{yFormat:v=>Number(v).toFixed(1)})+'</div>'+
        '</div>'+
      '</div>'+
    '</div>'+

    '<div class="dashboard-section"><div class="dashboard-section-title">Meals</div>'+
      '<div class="dashboard-grid dashboard-grid-2">'+
        '<div class="card chart-card"><div class="card-title">Meal Prep</div>'+donutChartSVG(prep.labels,prep.values,prep.colors)+'</div>'+
        '<div class="card chart-card"><div class="card-title">Calories</div>'+lineChartSVG([{name:'Calories',color:'var(--c-amber)',values:meal.cal}],meal.labels,{yFormat:v=>Math.round(v)})+'</div>'+
      '</div>'+
      '<div class="card chart-card"><div class="card-title">Protein</div>'+lineChartSVG([{name:'Protein',color:'var(--c-sage)',values:meal.protein}],meal.labels,{yFormat:v=>Math.round(v)})+'</div>'+
    '</div>'+

    '<div class="dashboard-grid dashboard-grid-2">'+
      '<div class="dashboard-section"><div class="dashboard-section-title">Sleep</div><div class="card chart-card">'+lineChartSVG([{name:'Hours',color:'var(--c-blue)',values:sleep.values}],sleep.labels,{yFormat:v=>Number(v).toFixed(1)})+'</div></div>'+
      '<div class="dashboard-section"><div class="dashboard-section-title">Water</div><div class="card chart-card">'+lineChartSVG([{name:'Water',color:'var(--c-blue)',values:water.values}],water.labels,{yFormat:v=>Math.round(v)})+'</div></div>'+
    '</div>'+

    '<div class="dashboard-grid dashboard-grid-2">'+
      '<div class="dashboard-section"><div class="dashboard-section-title">Calendar</div><div class="card chart-card">'+donutChartSVG(['Events','Tasks','Errands','Reminders'],[
        state.calendar.events.filter(e=>inRange(e.date,period)&&e.category==='Event').length,
        state.calendar.events.filter(e=>inRange(e.date,period)&&e.category==='Task').length,
        state.calendar.events.filter(e=>inRange(e.date,period)&&e.category==='Errands').length,
        state.calendar.events.filter(e=>inRange(e.date,period)&&e.category==='Reminder').length
      ],['var(--c-sage)','var(--c-amber)','var(--c-blue)','var(--c-coral)'])+'</div></div>'+
      '<div class="dashboard-section"><div class="dashboard-section-title">Reading</div><div class="card chart-card">'+lineChartSVG([{name:'Books',color:'var(--c-coral)',values:reading.values}],reading.labels,{yFormat:v=>Math.round(v)})+'</div></div>'+
    '</div>'+

    '<div class="dashboard-grid dashboard-grid-2">'+
      '<div class="dashboard-section"><div class="dashboard-section-title">Groceries</div><div class="card chart-card">'+lineChartSVG([{name:'Spend',color:'var(--c-sage)',values:grocery.values}],grocery.labels,{yFormat:v=>fmtMoney(v)})+'</div></div>'+
    '</div>';

  const catSel=document.getElementById('dashWorkoutCatSel');
  if(catSel) catSel.addEventListener('change',e=>{window.dashWorkoutCategory=e.target.value;renderDashboard();});
}

/* ---------- MONEY ---------- */
function acctFormHtml(){
  return '<form id="modalForm" class="form-col"><input required name="name" placeholder="Account name" class="input" /><select name="type" class="input"><option>Cash</option><option>Bank</option><option>E-wallet</option><option>Credit</option><option>Investment</option></select><input required name="start" type="number" step="0.01" placeholder="Starting balance" class="input" /><button class="btn btn-primary" type="submit">Add Account</button></form>';
}
function openAcctModal(){ openModal('Add Account', acctFormHtml()); bindModalSubmit(actAddAccount); }
function txnCategoriesHtml(type,selected){ const cats=((state.money.categories||{})[type]||[]); return '<option value="" disabled '+(selected?'':'selected')+'>Category</option>'+cats.map(c=>'<option value="'+esc(c)+'" '+(c===selected?'selected':'')+'>'+esc(c)+'</option>').join(''); }
function refreshTxnCategories(type,selected){ const el=document.getElementById('txnCategory'); if(el) el.innerHTML=txnCategoriesHtml(type,selected); }
function addMoneyCategoryModalHtml(type){ const label=type==='income'?'Income':'Expense'; return '<form id="modalForm" class="form-col"><div class="text-faint">Add a new '+label+' category.</div><input required name="name" placeholder="Category name" class="input" /><button class="btn btn-primary" type="submit">Add Category</button></form>'; }
function openAddMoneyCategoryModal(type){ openModal('Add '+(type==='income'?'Income':'Expense')+' Category',addMoneyCategoryModalHtml(type)); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const name=f.name.value.trim();if(!name)return;state.money.categories=state.money.categories||{income:[],expense:[]};state.money.categories[type]=state.money.categories[type]||[];if(!state.money.categories[type].includes(name))state.money.categories[type].push(name);await save('money');closeModal();openTxnModal(type,name);}); }
function txnFormHtml(defaultType,selectedCategory){ const type=defaultType||'expense'; return '<form id="modalForm" class="form-col">'+
  '<div class="form-row"><input required name="date" type="date" class="input" value="'+todayStr()+'" /><select name="type" id="txnType" class="input" onchange="refreshTxnCategories(this.value)"><option value="expense" '+(type==='expense'?'selected':'')+'>Expense</option><option value="income" '+(type==='income'?'selected':'')+'>Income</option></select></div>'+
  '<div class="form-row"><select required name="account" class="input"><option value="" disabled selected>Account</option>'+state.money.accounts.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select><div style="display:flex;gap:6px;flex:1"><select required name="category" id="txnCategory" class="input" style="flex:1">'+txnCategoriesHtml(type,selectedCategory)+'</select><button type="button" class="icon-add-btn" title="Add category" onclick="openAddMoneyCategoryModal(document.getElementById(\'txnType\').value)">+</button></div></div>'+
  '<div class="form-row"><input required name="amount" type="number" step="0.01" placeholder="Amount" class="input" /><input name="note" placeholder="Note (optional)" class="input" /></div>'+
  '<button class="btn btn-primary" type="submit">Add Transaction</button></form>'+(state.money.accounts.length?'':'<div class="empty">Add an account first.</div>'); }
function openTxnModal(defaultType,selectedCategory){ openModal('Add Transaction',txnFormHtml(defaultType,selectedCategory)); bindModalSubmit(actAddTxn); }
function transferFormHtml(kind='transfer',transfer=null){
  const isWithdraw=kind==='withdrawal', from=transfer?.account||'', to=transfer?.toAccount||'';
  const cashAccounts=state.money.accounts.filter(a=>a.type==='Cash');
  const accountOptions=state.money.accounts.map(a=>'<option value=\"'+a.id+'\" '+(a.id===from?'selected':'')+'>'+esc(a.name)+' · '+esc(a.type)+'</option>').join('');
  const toOptions=(isWithdraw?cashAccounts:state.money.accounts).map(a=>'<option value=\"'+a.id+'\" '+(a.id===to?'selected':'')+'>'+esc(a.name)+' · '+esc(a.type)+'</option>').join('');
  return '<form id=\"modalForm\" class=\"form-col\">'+
    '<div class=\"form-row\"><input required name=\"date\" type=\"date\" class=\"input\" value=\"'+(transfer?.date||todayStr())+'\"/><select name=\"kind\" id=\"transferKind\" class=\"input\" onchange=\"toggleTransferKind(this.value)\"><option value=\"transfer\" '+(!isWithdraw?'selected':'')+'>Transfer between accounts</option><option value=\"withdrawal\" '+(isWithdraw?'selected':'')+'>Withdraw as cash</option></select></div>'+
    '<div class=\"form-row\"><select required name=\"fromAccount\" class=\"input\">'+(accountOptions||'<option value=\"\">No accounts yet</option>')+'</select><div style=\"flex:1\"><select required name=\"toAccount\" id=\"transferToAccount\" class=\"input\">'+toOptions+'</select></div></div>'+
    '<div class=\"form-row\"><input required name=\"amount\" type=\"number\" min=\"0.01\" step=\"0.01\" class=\"input\" placeholder=\"Amount\" value=\"'+(transfer?.amount||'')+'\"/><input name=\"note\" class=\"input\" placeholder=\"Note (optional)\" value=\"'+esc(transfer?.note||'')+'\"/></div>'+
    '<div id=\"transferCashHint\" class=\"text-faint\" style=\"display:'+(isWithdraw?'block':'none')+'\">Cash withdrawal is recorded as a transfer into a Cash account.</div>'+
    '<button class=\"btn btn-primary\" type=\"submit\">'+(transfer?'Save Changes':'Save')+'</button></form>'+
    (isWithdraw&&!cashAccounts.length?'<div class=\"empty\">No Cash account yet. Saving this withdrawal will create one automatically.</div>':'');
}
function toggleTransferKind(kind){
  const sel=document.getElementById('transferToAccount'); if(!sel)return;
  const current=sel.value, accounts=kind==='withdrawal'?state.money.accounts.filter(a=>a.type==='Cash'):state.money.accounts;
  sel.innerHTML=accounts.map(a=>'<option value=\"'+a.id+'\" '+(a.id===current?'selected':'')+'>'+esc(a.name)+' · '+esc(a.type)+'</option>').join('');
  const hint=document.getElementById('transferCashHint'); if(hint) hint.style.display=kind==='withdrawal'?'block':'none';
}
function openTransferModal(kind='transfer'){ openModal(kind==='withdrawal'?'Withdraw Cash':'Transfer Money',transferFormHtml(kind)); bindModalSubmit(actAddTransfer); }
function openEditTransferModal(id){ const t=state.money.transactions.find(x=>x.id===id); if(!t||t.type!=='transfer') return; const kind=t.kind==='withdrawal'?'withdrawal':'transfer'; openModal('Edit '+(kind==='withdrawal'?'Cash Withdrawal':'Transfer'),transferFormHtml(kind,t)); const form=document.getElementById('modalForm'); if(form) form.dataset.transferId=id; bindModalSubmit(actEditTransfer); }
function budgetFormHtml(){
  const cats=['Rent','Food','Transpo','Utilities','Shopping','Health','Entertainment','Other'];
  return '<form id="modalForm" class="form-col">'+
    '<div class="form-row"><select required name="category" class="input"><option value="" disabled selected>Category</option>'+cats.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select><input required name="limit" type="number" step="0.01" placeholder="Monthly limit" class="input" /></div>'+
    '<div class="form-row"><label class="text-faint" style="display:flex;align-items:center;gap:7px">Reminder needed <select name="reminder" class="input" onchange="toggleBudgetReminder(this.value)"><option value="no">No</option><option value="yes">Yes</option></select></label></div>'+
    '<div id="budgetReminderFields" style="display:none" class="form-col"><div class="form-row"><input name="billName" placeholder="Bill name" class="input" /><input name="dueDate" type="date" class="input" value="'+todayStr()+'" /></div><select name="recurring" class="input"><option value="none">One-time</option><option value="monthly">Monthly</option></select></div>'+
    '<button class="btn btn-primary" type="submit">Add Budget</button></form>';
}
function toggleBudgetReminder(v){ const el=document.getElementById('budgetReminderFields'); if(el) el.style.display=v==='yes'?'flex':'none'; }
function openBudgetModal(){ openModal('Add Budget', budgetFormHtml()); bindModalSubmit(actAddBudget); }
function billFormHtml(){
  return '<form id="modalForm" class="form-col">'+
    '<div class="form-row"><input required name="name" placeholder="Bill name" class="input" /><input required name="amount" type="number" step="0.01" placeholder="Amount" class="input" /></div>'+
    '<div class="form-row"><input required name="dueDate" type="date" class="input" value="'+todayStr()+'" /><select name="recurring" class="input"><option value="none">One-time</option><option value="monthly">Monthly</option></select></div>'+
    '<select name="category" class="input"><option value="">Category</option><option>Rent</option><option>Food</option><option>Transpo</option><option>Utilities</option><option>Shopping</option><option>Health</option><option>Entertainment</option><option>Other</option></select>'+
    '<button class="btn btn-primary" type="submit">Add Bill</button></form>';
}
function openBillModal(){ openModal('Add Bill', billFormHtml()); bindModalSubmit(actAddBill); }
function noSpendFormHtml(){
  const days=DOW_LABELS.map((d,i)=>'<option value="'+i+'">'+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]+'</option>').join('');
  return '<form id="modalForm" class="form-col"><label class="input">Type<select name="type" class="input" onchange="toggleNoSpendType(this.value)"><option value="date">One date</option><option value="weekly">Weekly recurring</option></select></label><div id="noSpendDateRow"><input required name="date" type="date" class="input" value="'+todayStr()+'" /></div><div id="noSpendWeeklyRow" style="display:none"><select name="day" class="input">'+days+'</select></div><button class="btn btn-primary" type="submit">Add Target</button></form>'; 
}
function toggleNoSpendType(v){ const d=document.getElementById('noSpendDateRow'),w=document.getElementById('noSpendWeeklyRow'); if(d)d.style.display=v==='date'?'block':'none'; if(w)w.style.display=v==='weekly'?'block':'none'; }
function openNoSpendModal(){ openModal('Add No‑Spend Day', noSpendFormHtml()); bindModalSubmit(actAddNoSpend); }

function renderMoney(){
  const main=document.getElementById('main');
  const period=globalPeriod;
  const txns=[...state.money.transactions].filter(t=>inRange(t.date,period)).sort((a,b)=>b.date.localeCompare(a.date));
  const inc=txns.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp=txns.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const money=moneyIncExpSeries(period);
  const noSpend=noSpendBarData(period);
  const bills=billsPieData(period);

  main.innerHTML =
   '<div class="page-head"><div class="page-quote">Build awareness, build wealth.</div></div>'+
   dateFilterBar()+
   '<div class="card-grid stat-grid">'+statCard('Total Balance',fmtMoney(totalBalance()),'','var(--c-amber)')+statCard('Income (selected)',fmtMoney(inc),'','var(--c-sage)')+statCard('Expense (selected)',fmtMoney(exp),'','var(--c-coral)')+'</div>'+
   '<div class="card"><div class="card-title">Income vs Expenses</div>'+lineChartSVG(money.series,money.labels,{yFormat:v=>'₱'+Math.round(v/1000)+'k'})+chartLegend(money.series)+'</div>'+
   '<div class="two-col">'+
     '<div class="card"><div class="card-head-row"><div class="card-title">Accounts</div><button class="icon-add-btn" onclick="openAcctModal()">+</button></div>'+
       '<div class="life-management-list">'+(state.money.accounts.length? state.money.accounts.map(a=>'<div class="life-management-row"><span class="ev-title">'+esc(a.name)+' <span class="text-faint">· '+esc(a.type)+'</span></span><span class="mono">'+fmtMoney(acctBalance(a.id))+'</span><button class="btn-icon" onclick="openEditAccountModal (\''+a.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteAccount(\''+a.id+'\')">✕</button></div>').join('') : '<div class="empty">No accounts yet.</div>')+'</div>'+
     '</div>'+
     '<div class="card"><div class="card-head-row"><div class="card-title">Budgets (monthly)</div><button class="icon-add-btn" onclick="openBudgetModal()">+</button></div>'+
       (state.money.budgets.length? '<div class="life-management-list">'+state.money.budgets.map(b=>{ const spent=budgetSpent(b.category); const pct=b.limit? spent/b.limit*100:0; return '<div class="life-management-row" style="flex-direction:column;align-items:stretch;gap:6px"><div style="display:flex;justify-content:space-between"><span class="ev-title">'+esc(b.category)+'</span><span class="mono '+(spent>b.limit?'text-coral':'text-faint')+'">'+fmtMoney(spent)+' / '+fmtMoney(b.limit)+'</span><button class="btn-icon" onclick="openEditBudgetModal (\''+b.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteBudget(\''+b.id+'\')">✕</button></div>'+progressBar(pct,spent>b.limit?'var(--c-coral)':'var(--c-sage)')+'</div>'; }).join('')+'</div>' : '<div class="empty">No budgets set.</div>')+
     '</div>'+
   '</div>'+
   '<div class="two-col">'+
     '<div class="card money-bills-card"><div class="card-head-row"><div class="card-title">Bills</div><button class="icon-add-btn" onclick="openBillModal()">+</button></div>'+
       (state.money.bills.length? '<div class="life-management-list">'+state.money.bills.map(b=>{ const paid=isBillPaid(b); return '<div class="life-management-row"><span class="ev-title">'+esc(b.name)+' <span class="text-faint">· '+(b.recurring==='monthly'?'monthly':'once')+'</span></span><span class="mono">'+fmtMoney(b.amount)+'</span><span class="badge '+(paid?'badge-done':'badge-pending')+'">'+(paid?'Paid':'Unpaid')+'</span>'+(!paid?'<button class="btn-icon" style="color:var(--c-sage)" onclick="openPayBillModal(&quot;'+b.id+'&quot;)">Pay</button>':'')+'<button class="btn-icon" onclick="openEditBillModal (\''+b.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteBill(\''+b.id+'\')">✕</button></div>'; }).join('')+'</div>' : '<div class="empty">No bills yet.</div>')+
     '</div>'+
     '<div class="card money-nospend-card"><div class="card-head-row"><div class="card-title">No‑Spend Days</div><button class="icon-add-btn" onclick="openNoSpendModal()">+</button></div>'+
       ((state.money.noSpendRules||[]).length || (state.money.noSpendDays||[]).length ? '<div class="life-management-list">'+(state.money.noSpendRules||[]).map(r=>'<div class="life-management-row"><span class="ev-title">Every '+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(r.day)]+'</span><span class="badge badge-done">Weekly</span><button class="btn-icon" onclick="actDeleteNoSpendRule(\''+r.id+'\')">✕</button></div>').join('')+(state.money.noSpendDays||[]).sort().map(d=>{ const past=d<todayStr(); const ok=noSpendAchieved(d); return '<div class="life-management-row"><span class="ev-title">'+fmtDateLong(d)+'</span><span class="badge '+(ok?'badge-done':(past?'badge-high':'badge-pending'))+'">'+(ok?'Achieved':(past?'Failed':'Upcoming'))+'</span><button class="btn-icon" onclick="actDeleteNoSpend(\''+d+'\')">✕</button></div>'; }).join('')+'</div>' : '<div class="empty">No target days set. Add a date or a weekly recurring no-spend day.</div>')+
     '</div>'+
   '</div>'+
   '<div class="card"><div class="card-head-row"><div class="card-title">Transactions</div><div style="display:flex;gap:6px;align-items:center"><button class="btn-icon" title="Transfer between accounts" onclick="openTransferModal(&quot;transfer&quot;)">⇄</button><button class="btn-icon" title="Withdraw as cash" onclick="openTransferModal(&quot;withdrawal&quot;)">↘</button><button class="icon-add-btn" onclick="openTxnModal()">+</button></div></div>'+
     table(['Date','Account','Category','Note','Amount',''], txns.map(t=>{
       const acc=state.money.accounts.find(a=>a.id===t.account);
       const toAcc=t.type==='transfer'?state.money.accounts.find(a=>a.id===t.toAccount):null;
       const accountLabel=t.type==='transfer'?((acc?esc(acc.name):'—')+' → '+(toAcc?esc(toAcc.name):'—')):(acc?esc(acc.name):'—');
       const categoryLabel=t.type==='transfer'?(t.kind==='withdrawal'?'Cash Withdrawal':'Transfer'):esc(t.category);
       const amountClass=t.type==='transfer'?'text-faint':(t.type==='income'?'text-sage':'text-coral');
       const amountPrefix=t.type==='transfer'?'⇄':(t.type==='income'?'+':'-');
       const editButton=t.type==='transfer'?'<button class="btn-icon" onclick="openEditTransferModal(\''+t.id+'\')">✎</button>':'<button class="btn-icon" onclick="openEditTxnModal (\''+t.id+'\')">✎</button>';
       return '<tr><td class="mono">'+fmtDateShort(t.date)+'</td><td>'+accountLabel+'</td><td>'+categoryLabel+'</td><td class="text-faint">'+esc(t.note||'')+'</td><td class="mono '+amountClass+'">'+amountPrefix+fmtMoney(Math.abs(t.amount))+'</td><td>'+editButton+'<button class="btn-icon" onclick="actDeleteTxn(\''+t.id+'\')">✕</button></td></tr>';
     }))+
   '</div>';
}
async function actAddAccount(e){ e.preventDefault(); const f=e.target; state.money.accounts.push({id:uid(),name:f.name.value.trim(),type:f.type.value,start:Number(f.start.value)}); await save('money'); renderMoney(); }
async function actDeleteAccount(id){ if(!(await confirmDelete('Do you want to delete this account?'))) return; state.money.accounts=state.money.accounts.filter(a=>a.id!==id); const linked=state.money.transactions.filter(t=>t.account===id).map(t=>t.id); state.money.transactions=state.money.transactions.filter(t=>t.account!==id); await markTombstone('money.accounts',id); for(const tid of linked) await markTombstone('money.transactions',tid); await save('money'); renderMoney(); }
async function actAddTxn(e){ e.preventDefault(); const f=e.target; state.money.transactions.push({id:uid(),date:f.date.value,account:f.account.value,type:f.type.value,category:f.category.value.trim(),amount:Number(f.amount.value),note:f.note.value.trim()}); await save('money'); renderMoney(); }
async function ensureCashAccount(){ let cash=state.money.accounts.find(a=>a.type==='Cash'); if(!cash){ cash={id:uid(),name:'Cash',type:'Cash',start:0}; state.money.accounts.push(cash); } return cash; }
async function actAddTransfer(e){ e.preventDefault(); const f=e.target; const kind=f.kind.value, from=f.fromAccount.value; let to=f.toAccount?.value||''; const amount=Number(f.amount.value)||0; if(!from||amount<=0)return; if(kind==='withdrawal'){ const cash=await ensureCashAccount(); to=cash.id; } if(!to||from===to){ alert('Choose two different accounts for the transfer.'); return; } state.money.transactions.push({id:uid(),date:f.date.value,account:from,toAccount:to,type:'transfer',kind,amount,note:f.note.value.trim()}); await save('money'); renderMoney(); }
async function actEditTransfer(e){ e.preventDefault(); const f=e.target, id=f.dataset.transferId, t=state.money.transactions.find(x=>x.id===id); if(!t)return; const kind=f.kind.value, from=f.fromAccount.value; let to=f.toAccount?.value||''; if(kind==='withdrawal'){ const cash=await ensureCashAccount(); to=cash.id; } if(!from||!to||from===to){ alert('Choose two different accounts for the transfer.'); return; } Object.assign(t,{date:f.date.value,account:from,toAccount:to,type:'transfer',kind,amount:Number(f.amount.value)||0,note:f.note.value.trim()}); await save('money'); renderMoney(); }
async function actDeleteTxn(id){ if(!(await confirmDelete('Do you want to delete this transaction?'))) return; state.money.transactions=state.money.transactions.filter(t=>t.id!==id); await markTombstone('money.transactions',id); await save('money'); renderMoney(); }
function openEditTxnModal(id){ const t=state.money.transactions.find(x=>x.id===id); if(!t)return; openModal('Edit Transaction','<form id="modalForm" class="form-col"><div class="form-row"><input required name="date" type="date" class="input" value="'+t.date+'"/><select name="type" id="txnType" class="input" onchange="refreshTxnCategories(this.value)"><option value="expense" '+(t.type==='expense'?'selected':'')+'>Expense</option><option value="income" '+(t.type==='income'?'selected':'')+'>Income</option></select></div><div class="form-row"><select required name="account" class="input">'+state.money.accounts.map(a=>'<option value="'+a.id+'" '+(a.id===t.account?'selected':'')+'>'+esc(a.name)+'</option>').join('')+'</select><div style="display:flex;gap:6px;flex:1"><select required name="category" id="txnCategory" class="input" style="flex:1">'+txnCategoriesHtml(t.type,t.category)+'</select><button type="button" class="icon-add-btn" onclick="openAddMoneyCategoryModal(document.getElementById(\'txnType\').value)">+</button></div></div><div class="form-row"><input required name="amount" type="number" step="0.01" class="input" value="'+t.amount+'"/><input name="note" class="input" value="'+esc(t.note||'')+'"/></div><button class="btn btn-primary" type="submit">Save Changes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(t,{date:f.date.value,type:f.type.value,account:f.account.value,category:f.category.value,amount:Number(f.amount.value),note:f.note.value.trim()});await save('money');renderMoney();}); }
async function actAddBudget(e){ e.preventDefault(); const f=e.target; const budget={id:uid(),category:f.category.value.trim(),limit:Number(f.limit.value),reminderNeeded:f.reminder.value==='yes'}; state.money.budgets.push(budget); if(budget.reminderNeeded){ state.money.bills.push({id:uid(),name:(f.billName.value.trim()||budget.category),amount:budget.limit,dueDate:f.dueDate.value||todayStr(),recurring:f.recurring.value,category:budget.category,sourceBudgetId:budget.id,paidDates:[]}); } await save('money'); renderMoney(); }
async function actDeleteBudget(id){ if(!(await confirmDelete('Do you want to delete this budget?'))) return; state.money.budgets=state.money.budgets.filter(b=>b.id!==id); await markTombstone('money.budgets',id); await save('money'); renderMoney(); }
async function actAddBill(e){ e.preventDefault(); const f=e.target; state.money.bills.push({id:uid(),name:f.name.value.trim(),amount:Number(f.amount.value),dueDate:f.dueDate.value,recurring:f.recurring.value,category:f.category.value||'',paidDates:[]}); await save('money'); renderMoney(); }
async function actDeleteBill(id){ if(!(await confirmDelete('Do you want to delete this bill?'))) return; state.money.bills=state.money.bills.filter(b=>b.id!==id); await markTombstone('money.bills',id); await save('money'); renderMoney(); }
function payBillModalHtml(id){
  const b=state.money.bills.find(x=>x.id===id);
  if(!b) return '<div class="empty">Bill not found.</div>';
  if(!state.money.accounts.length) return '<div class="form-col"><div class="text-faint">Add an account first so the payment can be recorded as an expense.</div><button class="btn btn-primary" onclick="closeModal();openAcctModal()">Add Account</button></div>';
  const late=isBillOverdue(b);
  return '<form id="modalForm" class="form-col"><div class="life-management-row"><span class="ev-title">'+esc(b.name)+'</span><span class="mono">'+fmtMoney(b.amount)+'</span></div><select required name="account" class="input">'+state.money.accounts.map(a=>'<option value="'+a.id+'">'+esc(a.name)+' · '+fmtMoney(acctBalance(a.id))+'</option>').join('')+'</select><input required name="date" type="date" class="input" value="'+todayStr()+'"/>'+(late?'<div class="stat-label">Late payment note — why was this late?</div><textarea required name="lateNote" rows="3" class="input" placeholder="Reason for late payment"></textarea>':'')+'<button class="btn btn-primary" type="submit">Mark Paid</button></form>';
}
function openPayBillModal(id){ openModal('Pay Bill',payBillModalHtml(id)); if(document.getElementById('modalForm')) bindModalSubmit(e=>actPayBill(e,id)); }
async function actPayBill(e,id){ e.preventDefault(); const f=e.target; const b=state.money.bills.find(x=>x.id===id); if(!b) return; const key=billPeriodKey(b,f.date.value||todayStr()); b.paidDates=b.paidDates||[]; if(b.paidDates.includes(key)) return; const due=billDueDateForToday(b); const late=(new Date((f.date.value||todayStr())+'T00:00:00')-new Date(due+'T00:00:00'))>0; b.paymentMeta=b.paymentMeta||[]; b.paymentMeta.push({period:key,paidDate:f.date.value||todayStr(),late,lateNote:late?(f.lateNote.value||'').trim():''}); b.paidDates.push(key); state.money.transactions.push({id:uid(),date:f.date.value,account:f.account.value,type:'expense',category:b.category||b.name,amount:Number(b.amount),note:'Paid bill: '+b.name+(late?' · Late: '+(f.lateNote.value||'').trim():''),billId:b.id,latePayment:late,lateNote:late?(f.lateNote.value||'').trim():''}); if(b.recurring==='none') state.money.bills=state.money.bills.filter(x=>x.id!==id); await save('money'); renderMoney(); }
async function actAddNoSpend(e){ e.preventDefault(); const f=e.target; state.money.noSpendRules=state.money.noSpendRules||[]; if(f.type.value==='weekly'){ const day=Number(f.day.value); if(!state.money.noSpendRules.some(r=>r.type==='weekly'&&Number(r.day)===day)) state.money.noSpendRules.push({id:uid(),type:'weekly',day,startDate:todayStr(),createdAt:new Date().toISOString()}); } else if(f.date.value && !state.money.noSpendDays.includes(f.date.value)){ state.money.noSpendDays.push(f.date.value); } await save('money'); renderMoney(); }
async function actDeleteNoSpend(d){ if(!(await confirmDelete('Do you want to delete this no-spend target?'))) return; state.money.noSpendDays=state.money.noSpendDays.filter(x=>x!==d); await markTombstone('money.noSpendDays',d); await save('money'); renderMoney(); }
async function actDeleteNoSpendRule(id){ if(!(await confirmDelete('Do you want to delete this weekly no-spend rule?'))) return; state.money.noSpendRules=(state.money.noSpendRules||[]).filter(r=>r.id!==id); await markTombstone('money.noSpendRules',id); await save('money'); renderMoney(); }

/* ---------- TRADING ---------- */
let pendingTradeImage=null;
function tradeFormHtml(){
  return '<form id="modalForm" class="form-col">'+
    '<div class="form-row"><input required name="date" type="date" class="input" value="'+todayStr()+'" /><input required name="symbol" placeholder="Symbol" class="input" style="text-transform:uppercase" /><select name="side" class="input"><option value="long">Long</option><option value="short">Short</option></select></div>'+
    '<div class="form-row"><input required name="entry" type="number" step="0.0001" placeholder="Entry price" class="input" /><input required name="exit" type="number" step="0.0001" placeholder="Exit price" class="input" /><input required name="size" type="number" step="0.0001" placeholder="Size" class="input" /></div>'+
    '<select name="setup" class="input"><option value="">Setup type (optional)</option>'+TRADE_SETUPS.map(s=>'<option value="'+s+'">'+s+'</option>').join('')+'</select>'+
    '<input name="note" placeholder="Setup / notes" class="input" />'+
    '<div class="form-col"><div class="stat-label">Chart screenshot (optional)</div><input type="file" accept="image/*" class="input" id="tradeImgInput" /><div id="tradeImgPreview"></div></div>'+
    '<button class="btn btn-primary" type="submit">Log Trade</button>'+
  '</form>';
}
function openTradeModal(){
  pendingTradeImage=null;
  openModal('New Trade', tradeFormHtml());
  const imgInput=document.getElementById('tradeImgInput');
  imgInput.addEventListener('change', function(e){
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=function(ev){
      const img=new Image();
      img.onload=function(){
        const maxW=480; const scale=Math.min(1,maxW/img.width);
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        pendingTradeImage=canvas.toDataURL('image/jpeg',0.7);
        const prev=document.getElementById('tradeImgPreview');
        if(prev) prev.innerHTML='<img src="'+pendingTradeImage+'" style="max-width:100%;border-radius:8px;margin-top:8px" />';
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  bindModalSubmit(actAddTrade);
}
async function actAddTrade(e){
  e.preventDefault(); const f=e.target;
  state.trading.trades.push({id:uid(),date:f.date.value,symbol:f.symbol.value.trim(),side:f.side.value,entry:Number(f.entry.value),exit:Number(f.exit.value),size:Number(f.size.value),setup:f.setup.value,note:f.note.value.trim(),image:pendingTradeImage});
  await save('trading'); renderTrading();
}
async function actDeleteTrade(id){ if(!(await confirmDelete('Do you want to delete this trade?'))) return; state.trading.trades=state.trading.trades.filter(t=>t.id!==id); await markTombstone('trading.trades',id); await save('trading'); renderTrading(); }
function actViewTradeImage(id){ const t=state.trading.trades.find(x=>x.id===id); if(!t||!t.image) return; openModal('Trade Screenshot','<img src="'+t.image+'" style="max-width:100%;border-radius:8px" />'); }
function setupFrequencyChart(tradesList){
  const trades=tradesList||state.trading.trades;
  const counts=TRADE_SETUPS.map(s=>trades.filter(t=>t.setup===s).length);
  const max=Math.max(1,...counts);
  return '<div class="bar-chart">'+TRADE_SETUPS.map((s,i)=>'<div class="bar-col"><div class="bar" style="height:'+Math.max(4,counts[i]/max*100)+'px;background:var(--c-coral)"></div><div class="bar-label mono">'+counts[i]+'</div><div class="bar-label">'+s+'</div></div>').join('')+'</div>';
}

function renderTrading(){
  const main=document.getElementById('main');
  const period=globalPeriod;
  const trades=[...state.trading.trades].filter(t=>inRange(t.date,period)).sort((a,b)=>b.date.localeCompare(a.date));
  const totalPL=trades.reduce((s,t)=>s+tradePL(t),0);
  const winRate=trades.length? (trades.filter(t=>tradePL(t)>0).length/trades.length*100).toFixed(0) : '0';
  const plSeries=tradingPLSeries(period);

  main.innerHTML =
   '<div class="page-head"><div class="page-quote">Log entries, track your edge.</div></div>'+
   dateFilterBar()+
   '<div class="card-grid stat-grid">'+statCard('Total P/L',fmtUSD(totalPL),'',totalPL>=0?'var(--c-sage)':'var(--c-coral)')+statCard('Win Rate',winRate+'%',trades.length+' trades','var(--c-blue)')+'</div>'+
   '<div class="card"><div class="card-title">P/L Over Time</div>'+lineChartSVG(plSeries.series,plSeries.labels,{yFormat:v=>fmtUSD(v)})+'</div>'+
   '<div class="card"><div class="card-title">Setup Frequency</div>'+(state.trading.trades.length? setupFrequencyChart(trades) : '<div class="empty">Log trades with a setup type to see the breakdown.</div>')+'</div>'+
   '<div class="card"><div class="card-head-row"><div class="card-title">Trades</div><button class="icon-add-btn" onclick="openTradeModal()">+</button></div>'+
     table(['Date','Symbol','Side','Setup','Entry','Exit','P/L','Chart','Notes',''], trades.map(t=>{
       const pl=tradePL(t);
       return '<tr><td class="mono">'+fmtDateShort(t.date)+'</td><td class="mono">'+esc(t.symbol.toUpperCase())+'</td><td><span class="badge '+(t.side==='long'?'badge-done':'badge-pending')+'">'+t.side+'</span></td><td>'+(t.setup?'<span class="badge badge-low">'+esc(t.setup)+'</span>':'<span class="text-faint">—</span>')+'</td><td class="mono">'+t.entry+'</td><td class="mono">'+t.exit+'</td><td class="mono '+(pl>=0?'text-sage':'text-coral')+'">'+fmtUSD(pl)+'</td><td>'+(t.image?'<img src="'+t.image+'" style="width:34px;height:34px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="actViewTradeImage(\''+t.id+'\')" />':'<span class="text-faint">—</span>')+'</td><td class="text-faint">'+esc(t.note||'')+'</td><td><button class="btn-icon" onclick="openEditTradeModal (\''+t.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteTrade(\''+t.id+'\')">✕</button></td></tr>';
     }))+
   '</div>';
}

/* ---------- HABITS ---------- */
function habitDateRange(period){
  if(period==='day') return [todayStr()];
  if(period==='month'){ const a=[]; for(let i=29;i>=0;i--) a.push(daysAgoStr(i)); return a; }
  if(period==='year'){ const a=[]; for(let i=364;i>=0;i-=7) a.push(daysAgoStr(i)); return a.reverse(); }
  return last7Dates();
}
function addHabitModalHtml(){
  return '<form id="modalForm" class="form-col"><input required name="name" placeholder="New habit" class="input" /><div><div class="stat-label" style="margin-bottom:6px">Days scheduled</div>'+dowPicker('newHabit',[0,1,2,3,4,5,6])+'</div><button class="btn btn-primary" type="submit" style="align-self:flex-start">Add</button></form>';
}
function openAddHabitModal(){
  openModal('Add Habit', addHabitModalHtml());
  document.getElementById('modalForm').addEventListener('submit', async e=>{
    e.preventDefault(); const days=readDowPicker('newHabit');
    state.habits.habits.push({id:uid(),name:e.target.name.value.trim(),days:days.length?days:[0,1,2,3,4,5,6]});
    await save('habits'); closeModal(); renderHabits();
  });
}
async function actDeleteHabit(id){ if(!(await confirmDelete('Do you want to delete this habit?'))) return; state.habits.habits=state.habits.habits.filter(h=>h.id!==id); Object.values(state.habits.logs).forEach(day=>delete day[id]); await markTombstone('habits.habits',id); await save('habits'); renderHabits(); }
async function actToggleHabit(id,date){ if(!state.habits.logs[date]) state.habits.logs[date]={}; state.habits.logs[date][id]=!state.habits.logs[date][id]; await save('habits'); renderHabits(); }

function renderHabits(){
  const main=document.getElementById('main');
  const period=globalPeriod;
  const dates=habitDateRange(period);
  const compact=period==='year';
  if(habitsChartId===null || !state.habits.habits.find(h=>h.id===habitsChartId)) habitsChartId=(state.habits.habits[0]||{}).id||null;
  const streakSeries=habitsChartId? habitStreakSeries(habitsChartId,period) : {labels:[],values:[]};
  main.innerHTML =
   '<div class="page-head"><div class="page-quote">Show up daily.</div></div>'+
   dateFilterBar()+
   '<div class="card"><div class="card-title">Streak Over Time</div>'+
     (state.habits.habits.length? '<div class="chart-controls"><select class="input" id="habitsChartSel" style="max-width:220px">'+state.habits.habits.map(h=>'<option value="'+h.id+'" '+(h.id===habitsChartId?'selected':'')+'>'+esc(h.name)+'</option>').join('')+'</select></div>'+(streakSeries.labels.length? lineChartSVG([{name:'Streak',color:'var(--c-sage)',values:streakSeries.values}],streakSeries.labels,{}) : '<div class="empty">No scheduled days for this habit in the selected period.</div>') : '<div class="empty">Add a habit to see its streak chart.</div>')+
   '</div>'+
   '<div class="card"><div class="card-head-row"><div class="card-title">'+(period==='day'?'Today':period==='month'?'Last 30 Days':period==='year'?'Last Year (weekly)':'Last 7 Days')+'</div><button class="icon-add-btn" onclick="openAddHabitModal()">+</button></div>'+
     (state.habits.habits.length?
       '<div class="table-wrap"><table class="tbl habit-tbl"><thead><tr><th>Habit</th>'+dates.map(d=>'<th class="mono">'+(compact?fmtDateShort(d):new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'narrow'})+'<br/><span class="text-faint">'+fmtDateShort(d).split(' ')[1]+'</span>')+'</th>').join('')+'<th>Streak</th><th></th></tr></thead><tbody>'+
       state.habits.habits.map(h=>{ const hd=h.days||[0,1,2,3,4,5,6]; return '<tr><td>'+esc(h.name)+' <span class="text-faint mono" style="font-size:10px">'+hd.map(x=>DOW_LABELS[x]).join('')+'</span></td>'+dates.map(d=>{
         const dow=new Date(d+'T00:00:00').getDay();
         const scheduled=hd.includes(dow);
         if(!scheduled) return '<td><span class="cell-off">—</span></td>';
         const done=!!(state.habits.logs[d]&&state.habits.logs[d][h.id]);
         return '<td><button class="check '+(done?'checked':'')+'" onclick="actToggleHabit(\''+h.id+'\',\''+d+'\')"></button></td>';
       }).join('')+'<td class="mono">'+habitStreak(h.id)+'d</td><td><button class="btn-icon" onclick="openEditHabitModal (\''+h.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteHabit(\''+h.id+'\')">✕</button></td></tr>'; }).join('')+
       '</tbody></table></div>'
       : '<div class="empty">No habits yet. Add one.</div>')+
   '</div>';
  const habitsChartSel=document.getElementById('habitsChartSel'); if(habitsChartSel) habitsChartSel.addEventListener('change',e=>{ habitsChartId=e.target.value; renderHabits(); });
}

/* ---------- RUNNING ---------- */
function addRunModalHtml(){ return '<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+todayStr()+'" /><input required name="distance" type="number" step="0.01" placeholder="Distance (km)" class="input" /><input required name="duration" type="number" step="0.1" placeholder="Duration (min)" class="input" /><input name="note" placeholder="Note" class="input" /><button class="btn btn-primary" type="submit">Add</button></form>'; }
function openAddRunModal(){ openModal('Log a Run', addRunModalHtml()); bindModalSubmit(actAddRun); }
async function actAddRun(e){ e.preventDefault(); const f=e.target; state.running.runs.push({id:uid(),date:f.date.value,distance:Number(f.distance.value),duration:Number(f.duration.value),note:f.note.value.trim()}); await save('running'); renderRunning(); }
async function actDeleteRun(id){ if(!(await confirmDelete('Do you want to delete this run?'))) return; state.running.runs=state.running.runs.filter(r=>r.id!==id); await markTombstone('running.runs',id); await save('running'); renderRunning(); }

function renderRunning(){
  const main=document.getElementById('main');
  const period=globalPeriod;
  const runs=[...state.running.runs].filter(r=>inRange(r.date,period)).sort((a,b)=>b.date.localeCompare(a.date));
  const totalDist=state.running.runs.reduce((s,r)=>s+Number(r.distance),0);
  const dist=runningDistanceSeries(period);
  main.innerHTML =
   '<div class="page-head"><div class="page-quote">Every kilometer logged.</div></div>'+
   dateFilterBar()+
   '<div class="card-grid stat-grid">'+statCard('Total Distance',totalDist.toFixed(1)+' km','','var(--c-sage)')+statCard('This Week',weekDistance().toFixed(1)+' km','','var(--c-blue)')+statCard('Runs Logged',state.running.runs.length,'','var(--c-amber)')+'</div>'+
   '<div class="card"><div class="card-title">Distance Over Time</div>'+lineChartSVG(dist.series,dist.labels,{})+'</div>'+
   '<div class="card"><div class="card-head-row"><div class="card-title">Runs</div><button class="icon-add-btn" onclick="openAddRunModal()">+</button></div>'+
     table(['Date','Distance','Duration','Pace','Note',''], runs.map(r=>'<tr><td class="mono">'+fmtDateShort(r.date)+'</td><td class="mono">'+Number(r.distance).toFixed(2)+' km</td><td class="mono">'+r.duration+' min</td><td class="mono">'+paceStr(Number(r.distance),Number(r.duration))+'</td><td class="text-faint">'+esc(r.note||'')+'</td><td><button class="btn-icon" onclick="openEditRunModal (\''+r.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteRun(\''+r.id+'\')">✕</button></td></tr>'))+
   '</div>';
}


/* ---------- UNIVERSAL EDIT MODALS ---------- */
/*
  V43 had Edit buttons for many tabs whose openEdit* functions were missing.
  The buttons rendered, but clicking them could do nothing. V44 defines every
  missing editor explicitly and keeps each editor bound to the existing record id.
*/
function openEditBudgetModal(id){
  const b=state.money.budgets.find(x=>x.id===id); if(!b)return;
  const linked=state.money.bills.find(x=>x.sourceBudgetId===id);
  const cats=['Rent','Food','Transpo','Utilities','Shopping','Health','Entertainment','Other'];
  openModal('Edit Budget','<form id="modalForm" class="form-col">'+
    '<div class="form-row"><select required name="category" class="input">'+cats.map(c=>'<option value="'+c+'" '+(b.category===c?'selected':'')+'>'+c+'</option>').join('')+'</select>'+
    '<input required name="limit" type="number" step="0.01" class="input" value="'+Number(b.limit||0)+'"/></div>'+
    '<label class="text-faint" style="display:flex;align-items:center;gap:7px">Reminder needed <select name="reminder" class="input"><option value="no" '+(!b.reminderNeeded?'selected':'')+'>No</option><option value="yes" '+(b.reminderNeeded?'selected':'')+'>Yes</option></select></label>'+
    '<div class="form-row"><input name="billName" class="input" placeholder="Bill name" value="'+esc(linked?.name||'')+'"/><input name="dueDate" type="date" class="input" value="'+(linked?.dueDate||todayStr())+'"/></div>'+
    '<select name="recurring" class="input"><option value="none" '+((linked?.recurring||'none')==='none'?'selected':'')+'>One-time</option><option value="monthly" '+(linked?.recurring==='monthly'?'selected':'')+'>Monthly</option></select>'+
    '<button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{
    e.preventDefault(); const f=e.target;
    b.category=f.category.value.trim(); b.limit=Number(f.limit.value)||0; b.reminderNeeded=f.reminder.value==='yes';
    const current=state.money.bills.find(x=>x.sourceBudgetId===id);
    if(b.reminderNeeded){
      if(current){ Object.assign(current,{name:f.billName.value.trim()||b.category,amount:b.limit,dueDate:f.dueDate.value||todayStr(),recurring:f.recurring.value,category:b.category}); }
      else state.money.bills.push({id:uid(),name:f.billName.value.trim()||b.category,amount:b.limit,dueDate:f.dueDate.value||todayStr(),recurring:f.recurring.value,category:b.category,sourceBudgetId:id,paidDates:[]});
    } else if(current){
      state.money.bills=state.money.bills.filter(x=>x.id!==current.id);
      await markTombstone('money.bills',current.id);
    }
    await save('money'); renderMoney();
  });
}

function openEditBillModal(id){
  const b=state.money.bills.find(x=>x.id===id); if(!b)return;
  const cats=['Rent','Food','Transpo','Utilities','Shopping','Health','Entertainment','Other'];
  openModal('Edit Bill','<form id="modalForm" class="form-col">'+
    '<div class="form-row"><input required name="name" class="input" value="'+esc(b.name)+'"/><input required name="amount" type="number" step="0.01" class="input" value="'+Number(b.amount||0)+'"/></div>'+
    '<div class="form-row"><input required name="dueDate" type="date" class="input" value="'+(b.dueDate||todayStr())+'"/><select name="recurring" class="input"><option value="none" '+(b.recurring==='none'?'selected':'')+'>One-time</option><option value="monthly" '+(b.recurring==='monthly'?'selected':'')+'>Monthly</option></select></div>'+
    '<select name="category" class="input"><option value="">Category</option>'+cats.map(c=>'<option value="'+c+'" '+(b.category===c?'selected':'')+'>'+c+'</option>').join('')+'</select>'+
    '<button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(b,{name:f.name.value.trim(),amount:Number(f.amount.value)||0,dueDate:f.dueDate.value,recurring:f.recurring.value,category:f.category.value||''});await save('money');renderMoney();});
}

function openEditTradeModal(id){
  const t=state.trading.trades.find(x=>x.id===id); if(!t)return;
  openModal('Edit Trade','<form id="modalForm" class="form-col">'+
    '<div class="form-row"><input required name="date" type="date" class="input" value="'+t.date+'"/><input required name="symbol" class="input" value="'+esc(t.symbol)+'"/><select name="side" class="input"><option value="long" '+(t.side==='long'?'selected':'')+'>Long</option><option value="short" '+(t.side==='short'?'selected':'')+'>Short</option></select></div>'+
    '<div class="form-row"><input required name="entry" type="number" step="0.0001" class="input" value="'+Number(t.entry||0)+'"/><input required name="exit" type="number" step="0.0001" class="input" value="'+Number(t.exit||0)+'"/><input required name="size" type="number" step="0.0001" class="input" value="'+Number(t.size||0)+'"/></div>'+
    '<select name="setup" class="input"><option value="">Setup type (optional)</option>'+TRADE_SETUPS.map(x=>'<option value="'+x+'" '+(t.setup===x?'selected':'')+'>'+x+'</option>').join('')+'</select>'+
    '<input name="note" class="input" value="'+esc(t.note||'')+'" placeholder="Setup / notes"/>'+
    '<button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(t,{date:f.date.value,symbol:f.symbol.value.trim(),side:f.side.value,entry:Number(f.entry.value),exit:Number(f.exit.value),size:Number(f.size.value),setup:f.setup.value,note:f.note.value.trim()});await save('trading');renderTrading();});
}

function openEditHabitModal(id){
  const h=state.habits.habits.find(x=>x.id===id); if(!h)return;
  openModal('Edit Habit','<form id="modalForm" class="form-col"><input required name="name" class="input" value="'+esc(h.name)+'"/><div><div class="stat-label" style="margin-bottom:6px">Days scheduled</div>'+dowPicker('editHabit',h.days||[0,1,2,3,4,5,6])+'</div><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const days=readDowPicker('editHabit');Object.assign(h,{name:f.name.value.trim(),days:days.length?days:[0,1,2,3,4,5,6]});await save('habits');renderHabits();});
}

function openEditRunModal(id){
  const r=state.running.runs.find(x=>x.id===id); if(!r)return;
  openModal('Edit Run','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+r.date+'"/><input required name="distance" type="number" step="0.01" class="input" value="'+Number(r.distance||0)+'"/><input required name="duration" type="number" step="0.1" class="input" value="'+Number(r.duration||0)+'"/><input name="note" class="input" value="'+esc(r.note||'')+'"/><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(r,{date:f.date.value,distance:Number(f.distance.value),duration:Number(f.duration.value),note:f.note.value.trim()});await save('running');renderRunning();});
}


function openEditEventModal(id){
  const x=state.calendar.events.find(e=>e.id===id); if(!x)return;
  openModal('Edit Event','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+x.date+'"/><input name="time" type="time" class="input" value="'+(x.time||'')+'"/><input required name="title" class="input" value="'+esc(x.title)+'"/><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{date:f.date.value,time:f.time.value,title:f.title.value.trim()});calSelected=x.date;await save('calendar');renderCalendar();});
}

function openEditMealModal(id){
  const x=state.meals.entries.find(e=>e.id===id); if(!x)return;
  openModal('Edit Meal','<form id="modalForm" class="form-col"><div class="form-row"><input required name="date" type="date" class="input" value="'+x.date+'"/><select name="category" class="input"><option value="">Category (optional)</option>'+MEAL_CATEGORIES.map(c=>'<option value="'+c+'" '+(x.category===c?'selected':'')+'>'+c+'</option>').join('')+'</select></div><input required name="name" class="input" value="'+esc(x.name)+'"/><div class="form-row"><input required name="cal" type="number" class="input" value="'+Number(x.cal||0)+'"/><input required name="protein" type="number" class="input" value="'+Number(x.protein||0)+'"/></div><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{date:f.date.value,name:f.name.value.trim(),cal:Number(f.cal.value),protein:Number(f.protein.value),category:f.category.value});await save('meals');renderMeals();});
}

function openEditSleepModal(id){
  const x=state.sleep.entries.find(e=>e.id===id); if(!x)return;
  openModal('Edit Sleep','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+x.date+'"/><select required name="type" class="input"><option value="night" '+((x.type||'night')==='night'?'selected':'')+'>Night sleep</option><option value="nap" '+(x.type==='nap'?'selected':'')+'>Nap</option></select><div class="form-row"><input required name="bed" type="time" class="input" value="'+x.bed+'"/><input required name="wake" type="time" class="input" value="'+x.wake+'"/></div><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{date:f.date.value,type:f.type.value,bed:f.bed.value,wake:f.wake.value});await save('sleep');renderSleepWater();});
}

function openEditWaterModal(id){
  const x=state.water.entries.find(e=>e.id===id); if(!x)return;
  openModal('Edit Water Log','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+x.date+'"/><div class="form-row"><input required name="time" type="time" class="input" value="'+(x.time||'')+'"/><input required name="amount" type="number" min="0" class="input" value="'+Number(x.amount||0)+'"/></div><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{date:f.date.value,time:f.time.value,amount:Number(f.amount.value)});await save('water');renderWater();});
}

function openEditBookModal(id){
  const b=state.reading.books.find(x=>x.id===id); if(!b)return;
  openModal('Edit Book','<form id="modalForm" class="form-col"><input required name="title" class="input" value="'+esc(b.title)+'"/><input name="author" class="input" value="'+esc(b.author||'')+'"/><input required name="pages" type="number" class="input" value="'+Number(b.pages||0)+'"/><input name="current" type="number" min="0" class="input" value="'+Number(b.current||0)+'"/><select name="status" class="input"><option value="want" '+(b.status==='want'?'selected':'')+'>Want to Read</option><option value="reading" '+(b.status==='reading'?'selected':'')+'>Reading</option><option value="done" '+(b.status==='done'?'selected':'')+'>Finished</option></select><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(b,{title:f.title.value.trim(),author:f.author.value.trim(),pages:Number(f.pages.value),current:Number(f.current.value),status:f.status.value});await save('reading');renderReading();});
}

function openEditJournalModal(id){
  const x=state.journal.entries.find(e=>e.id===id); if(!x)return;
  openModal('Edit Journal Entry','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+x.date+'"/><input required name="title" class="input" value="'+esc(x.title)+'"/><textarea required name="body" rows="7" class="input">'+esc(x.body)+'</textarea><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{date:f.date.value,title:f.title.value.trim(),body:f.body.value.trim()});await save('journal');renderJournal();});
}
/* ---------- WORKOUT ---------- */
function scheduleModalHtml(){
  const cats=state.workout.categories||[];
  return '<div class="sched-grid">'+DOW_LABELS.map((l,i)=>{
    const full=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i];
    const cur=state.workout.schedule[i]||'';
    return '<div class="sched-day"><div class="sched-day-label">'+full+'</div><select class="input" style="width:100%" onchange="modalSetScheduleDay('+i+',this.value)"><option value="">—</option>'+cats.map(c=>'<option value="'+esc(c)+'" '+(cur===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>';
  }).join('')+'</div>'+(cats.length?'':'<div class="empty" style="margin-top:10px">Add a category first.</div>');
}
function openScheduleModal(){ openModal('Training Schedule', scheduleModalHtml()); }
async function modalSetScheduleDay(dow,val){
  if(val) state.workout.schedule[dow]=val; else delete state.workout.schedule[dow];
  await save('workout');
  renderWorkout();
  const b=document.getElementById('modalBody'); if(b) b.innerHTML=scheduleModalHtml();
}
function categoriesModalHtml(){
  const cats=state.workout.categories||[];
  return '<form id="modalForm" class="form-row"><input required name="cat" placeholder="New category (e.g. Leg Day)" class="input" /><button class="btn btn-primary" type="submit">Add</button></form>'+
   (cats.length? '<div class="life-management-list" style="margin-top:10px">'+cats.map(c=>'<div class="life-management-row"><span class="ev-title">'+esc(c)+'</span><button class="btn-icon" onclick="modalDeleteCategory(\''+esc(c).replace(/'/g,"\\'")+'\')">✕</button></div>').join('')+'</div>' : '<div class="empty">No categories yet.</div>');
}
function openCategoriesModal(){
  openModal('Training Categories', categoriesModalHtml());
  document.getElementById('modalForm').addEventListener('submit', async e=>{
    e.preventDefault(); const f=e.target; const name=f.cat.value.trim();
    if(name && !state.workout.categories.includes(name)) state.workout.categories.push(name);
    await save('workout'); renderWorkout(); openCategoriesModal();
  });
}
async function modalDeleteCategory(name){
  if(!(await confirmDelete('Do you want to delete this workout category?'))) return;
  state.workout.categories=state.workout.categories.filter(c=>c!==name);
  Object.keys(state.workout.schedule).forEach(k=>{ if(state.workout.schedule[k]===name) delete state.workout.schedule[k]; });
  await save('workout'); renderWorkout(); openCategoriesModal();
}
function exercisePlanModalHtml(plan){
  plan=plan||{name:'',category:(state.workout.categories||[])[0]||'',weekdays:[new Date(todayStr()+'T00:00:00').getDay()]};
  return '<form id="modalForm" class="form-col"><input required name="name" placeholder="Exercise (e.g. Hip Thrust)" class="input" value="'+esc(plan.name)+'"/><select required name="category" class="input">'+(state.workout.categories||[]).map(c=>'<option value="'+esc(c)+'" '+(c===plan.category?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select><div><div class="stat-label" style="margin-bottom:6px">Scheduled days</div>'+dowPicker('exercisePlan',plan.weekdays||[0,1,2,3,4,5,6])+'</div><button class="btn btn-primary" type="submit">'+(plan.id?'Save Exercise':'Add Exercise')+'</button></form>';
}
function openAddExerciseModal(){ openModal('Add Exercise',exercisePlanModalHtml()); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const days=readDowPicker('exercisePlan');state.workout.exercisePlans.push({id:uid(),name:f.name.value.trim(),category:f.category.value,weekdays:days.length?days:[0,1,2,3,4,5,6],actuals:[]});await save('workout');renderWorkout();}); }
function openEditExercisePlanModal(id){ const p=state.workout.exercisePlans.find(x=>x.id===id); if(!p)return; openModal('Edit Exercise',exercisePlanModalHtml(p)); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const days=readDowPicker('exercisePlan');Object.assign(p,{name:f.name.value.trim(),category:f.category.value,weekdays:days.length?days:[0,1,2,3,4,5,6]});await save('workout');renderWorkout();}); }
async function actDeleteExercisePlan(id){ const p=state.workout.exercisePlans.find(x=>x.id===id); if(!p)return; if(!(await confirmDelete('Do you want to delete this exercise?'))) return; state.workout.exercisePlans=state.workout.exercisePlans.filter(x=>x.id!==id); await markTombstone('workout.exercisePlans',id); for(const a of (p.actuals||[])) await markTombstone('workout.exerciseLogs',String(id)+'::'+String(a.date)); await save('workout'); renderWorkout(); }
function workoutSessionModalHtml(plan,dateStr){ const actual=(plan.actuals||[]).find(a=>a.date===dateStr)||{}; return '<form id="modalForm" class="form-col"><div class="life-management-row"><span class="ev-title">'+esc(plan.name)+'</span><span class="badge badge-low">'+esc(plan.category)+'</span></div><input required name="date" type="date" class="input" value="'+dateStr+'"/><div class="form-row"><input required name="sets" type="number" min="0" class="input" value="'+(actual.sets??'')+'" placeholder="Actual Sets"/><input required name="reps" type="number" min="0" class="input" value="'+(actual.reps??'')+'" placeholder="Actual Reps"/><input required name="weight" type="number" step="0.5" min="0" class="input" value="'+(actual.weight??'')+'" placeholder="Actual Weight"/></div><button class="btn btn-primary" type="submit">Save Workout Log</button></form>'; }
function openWorkoutSessionModal(id,dateStr){ const p=state.workout.exercisePlans.find(x=>x.id===id); if(!p)return; openModal('Workout Log',workoutSessionModalHtml(p,dateStr||workoutLogDate)); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const d=f.date.value;const idx=(p.actuals||[]).findIndex(a=>a.date===d);const actual={date:d,sets:Number(f.sets.value),reps:Number(f.reps.value),weight:Number(f.weight.value)};p.actuals=p.actuals||[];if(idx>=0)p.actuals[idx]=actual;else p.actuals.push(actual);await save('workout');renderWorkout();}); }
function newWorkoutLogModalHtml(){ const plans=state.workout.exercisePlans||[]; return '<form id="modalForm" class="form-col"><select required name="plan" class="input">'+plans.map(p=>'<option value="'+p.id+'">'+esc(p.name)+' · '+esc(p.category)+'</option>').join('')+'</select><input required name="date" type="date" class="input" value="'+(workoutLogDate||todayStr())+'"/><div class="form-row"><input required name="sets" type="number" min="0" class="input" placeholder="Actual Sets"/><input required name="reps" type="number" min="0" class="input" placeholder="Actual Reps"/><input required name="weight" type="number" step="0.5" min="0" class="input" placeholder="Actual Weight"/></div><button class="btn btn-primary" type="submit">Add Workout Log</button></form>'; }
function openNewWorkoutLogModal(){ if(!(state.workout.exercisePlans||[]).length){alert('Add an exercise first.');return;} openModal('Add Workout Log',newWorkoutLogModalHtml()); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const p=state.workout.exercisePlans.find(x=>x.id===f.plan.value);if(!p)return;p.actuals=p.actuals||[];const actual={date:f.date.value,sets:Number(f.sets.value),reps:Number(f.reps.value),weight:Number(f.weight.value)};const idx=p.actuals.findIndex(a=>a.date===actual.date);if(idx>=0)p.actuals[idx]=actual;else p.actuals.push(actual);workoutLogDate=actual.date;await save('workout');renderWorkout();}); }
async function actDeleteWorkoutLog(planId,date){ const p=state.workout.exercisePlans.find(x=>x.id===planId); if(!p)return; if(!(await confirmDelete('Do you want to delete this workout log?'))) return; p.actuals=(p.actuals||[]).filter(a=>a.date!==date); await markTombstone('workout.exerciseLogs',String(planId)+'::'+String(date)); await save('workout'); renderWorkout(); }
async function actDeleteExLog(id){ const p=state.workout.exercisePlans.find(x=>x.id===id); if(!p)return; if(!(await confirmDelete('Do you want to delete this exercise and its workout history?'))) return; state.workout.exercisePlans=state.workout.exercisePlans.filter(x=>x.id!==id); await markTombstone('workout.exercisePlans',id); for(const a of (p.actuals||[])) await markTombstone('workout.exerciseLogs',String(id)+'::'+String(a.date)); await save('workout'); renderWorkout(); }
async function actDeleteMeditation(id){ if(!(await confirmDelete('Do you want to delete this meditation?'))) return; state.workout.sessions=state.workout.sessions.filter(s=>s.id!==id); await markTombstone('workout.sessions',id); await save('workout'); renderWorkout(); }

function stopwatchModalHtml(){
  return '<div class="timer-card"><div class="timer-display mono" id="swDisplay">'+fmtClock(sw.elapsed)+'</div>'+
  '<div class="form-row" style="justify-content:center"><input id="swMinutes" type="number" min="0" step="1" class="input input-sm" placeholder="Min" value="'+Math.floor(sw.elapsed/60000)+'" /><input id="swSeconds" type="number" min="0" max="59" step="1" class="input input-sm" placeholder="Sec" value="'+Math.floor((sw.elapsed%60000)/1000)+'" /><button class="btn btn-ghost" onclick="modalSwSetTime()">Set</button></div>'+
  '<div class="timer-controls"><button class="btn btn-primary" onclick="modalSwToggle()">'+(sw.running?'Pause':'Start')+'</button><button class="btn btn-ghost" onclick="modalSwReset()">Reset</button><button class="btn btn-ghost" onclick="modalLogMeditation()">Log Meditation</button></div></div>';
}
function openStopwatchModal(){ openModal('Stopwatch', stopwatchModalHtml()); }
function refreshStopwatchModal(){ const b=document.getElementById('modalBody'); if(b) b.innerHTML=stopwatchModalHtml(); }
function modalSwSetTime(){
  if(sw.running) return;
  const m=Math.max(0,Number(document.getElementById('swMinutes')?.value)||0);
  const sec=Math.max(0,Math.min(59,Number(document.getElementById('swSeconds')?.value)||0));
  sw.elapsed=(m*60+sec)*1000; refreshStopwatchModal();
}
function modalSwToggle(){
  if(sw.running){ sw.running=false; clearInterval(sw.intervalId); }
  else{ sw.running=true; sw.startTs=Date.now()-sw.elapsed; sw.intervalId=setInterval(()=>{ sw.elapsed=Date.now()-sw.startTs; const el=document.getElementById('swDisplay'); if(el) el.textContent=fmtClock(sw.elapsed); },250); }
  refreshStopwatchModal();
}
function modalSwReset(){ sw.running=false; clearInterval(sw.intervalId); sw.elapsed=0; refreshStopwatchModal(); }
async function modalLogMeditation(){
  const elapsed=sw.elapsed;
  openModal('Save Meditation','<form id="modalForm" class="form-col"><input required name="name" class="input" placeholder="Workout Name" value="Meditation"/><input required name="date" type="date" class="input" value="'+todayStr()+'"/><div class="text-faint">Duration: '+fmtClock(elapsed)+'</div><textarea name="note" class="input" rows="3" placeholder="Notes (optional)"></textarea><button class="btn btn-primary" type="submit">Save Meditation</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;state.workout.sessions.push({id:uid(),date:f.date.value,name:f.name.value.trim()||'Meditation',durationMs:elapsed,note:f.note.value.trim()});await save('workout');modalSwReset();closeModal();renderWorkout();});
}
function restModalHtml(){
  return '<div class="timer-card"><div class="timer-display mono" id="cdDisplay">'+fmtClock(cd.remaining)+'</div>'+
  '<div class="form-row" style="justify-content:center"><input id="cdMinutes" type="number" min="0" step="1" class="input input-sm" placeholder="Min" value="'+Math.floor(cd.remaining/60000)+'" /><input id="cdSeconds" type="number" min="0" max="59" step="1" class="input input-sm" placeholder="Sec" value="'+Math.floor((cd.remaining%60000)/1000)+'" /><button class="btn btn-ghost" onclick="modalCdSetTime()">Set</button></div>'+
  '<div class="timer-controls"><button class="btn btn-ghost" onclick="modalCdPreset(30)">30s</button><button class="btn btn-ghost" onclick="modalCdPreset(60)">60s</button><button class="btn btn-ghost" onclick="modalCdPreset(90)">90s</button><button class="btn btn-primary" onclick="modalCdToggle()">'+(cd.running?'Pause':'Start')+'</button><button class="btn btn-ghost" onclick="modalCdReset()">Reset</button></div></div>';
}
function openRestModal(){ openModal('Rest Timer', restModalHtml()); }
function refreshRestModal(){ const b=document.getElementById('modalBody'); if(b) b.innerHTML=restModalHtml(); }
function modalCdPreset(sec){ cd.total=sec*1000; cd.remaining=sec*1000; refreshRestModal(); }
function modalCdSetTime(){
  if(cd.running) return;
  const m=Math.max(0,Number(document.getElementById('cdMinutes')?.value)||0);
  const sec=Math.max(0,Math.min(59,Number(document.getElementById('cdSeconds')?.value)||0));
  cd.total=(m*60+sec)*1000; cd.remaining=cd.total; refreshRestModal();
}
function modalCdToggle(){
  if(cd.remaining<=0 && !cd.running) return;
  if(cd.running){ cd.running=false; clearInterval(cd.intervalId); }
  else{ cd.running=true; cd.intervalId=setInterval(()=>{ cd.remaining-=250; if(cd.remaining<=0){ cd.remaining=0; cd.running=false; clearInterval(cd.intervalId); beep(); } const el=document.getElementById('cdDisplay'); if(el) el.textContent=fmtClock(cd.remaining); if(!cd.running) refreshRestModal(); },250); }
  refreshRestModal();
}
function modalCdReset(){ cd.running=false; clearInterval(cd.intervalId); cd.remaining=cd.total; refreshRestModal(); }

function bodyWeightModalHtml(existing){ const x=existing||{}; return '<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+(x.date||todayStr())+'"/><input required name="weight" type="number" step="0.1" min="0" class="input" placeholder="Body weight (kg)" value="'+(x.weight??'')+'"/><div class="text-faint">Use one entry per month.</div><button class="btn btn-primary" type="submit">Save Body Weight</button></form>'; }
function openBodyWeightModal(){ openModal('Body Weight',bodyWeightModalHtml()); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const ym=f.date.value.slice(0,7);state.workout.bodyWeights=state.workout.bodyWeights||[];const existing=state.workout.bodyWeights.find(x=>x.date&&x.date.slice(0,7)===ym);const row={id:existing?existing.id:uid(),date:f.date.value,weight:Number(f.weight.value)};if(existing)Object.assign(existing,row);else state.workout.bodyWeights.push(row);await save('workout');renderWorkout();}); }
function openEditBodyWeightModal(id){ const x=(state.workout.bodyWeights||[]).find(w=>w.id===id); if(!x)return; openModal('Edit Body Weight',bodyWeightModalHtml(x)); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const ym=f.date.value.slice(0,7);const other=(state.workout.bodyWeights||[]).find(w=>w.id!==id&&w.date&&w.date.slice(0,7)===ym);if(other){alert('A body weight entry already exists for that month.');return;}Object.assign(x,{date:f.date.value,weight:Number(f.weight.value)});await save('workout');renderWorkout();}); }
async function actDeleteBodyWeight(id){ if(!(await confirmDelete('Do you want to delete this body weight entry?'))) return; state.workout.bodyWeights=(state.workout.bodyWeights||[]).filter(x=>x.id!==id); await markTombstone('workout.bodyWeights',id); await save('workout'); renderWorkout(); }
let workoutLogDate=todayStr();
function renderWorkout(){
  const main=document.getElementById('main');
  const period=globalPeriod;
  const sessions=[...state.workout.sessions].filter(s=>inRange(s.date,period)).sort((a,b)=>b.date.localeCompare(a.date));
  const cats=state.workout.categories||[];
  const todayCat=todayCategory();
  if(!state.workout.exercisePlans) state.workout.exercisePlans=[];
  if(!state.workout.bodyWeights) state.workout.bodyWeights=[];
  const selectedDate=workoutLogDate||todayStr();
  const plansById=new Map(state.workout.exercisePlans.map(p=>[p.id,p]));
  const actualRows=[];
  state.workout.exercisePlans.forEach(p=>(p.actuals||[]).forEach(a=>{
    if(a.date===selectedDate && inRange(a.date,period)) actualRows.push({p,a});
  }));
  actualRows.sort((x,y)=>x.p.category.localeCompare(y.p.category)||x.p.name.localeCompare(y.p.name));
  main.innerHTML=
   '<div class="page-head"><div class="page-quote">Move with intention.</div></div>'+dateFilterBar()+
   '<div class="card"><div class="card-title">Training Tools'+(todayCat?' <span class="badge badge-low">Today: '+esc(todayCat)+'</span>':'')+'</div>'+
     '<div class="quick-add"><button class="btn btn-ghost" onclick="openScheduleModal()">Schedule</button><button class="btn btn-ghost" onclick="openCategoriesModal()">Categories</button><button class="btn btn-primary" onclick="openAddExerciseModal()">+ Add Exercise</button><button class="btn btn-primary" onclick="openNewWorkoutLogModal()">+ Log Workout</button><button class="btn btn-ghost" onclick="openStopwatchModal()">Stopwatch'+(sw.running?' · '+fmtClock(sw.elapsed):"")+'</button><button class="btn btn-ghost" onclick="openRestModal()">Rest Timer</button></div>'+
   '</div>'+
   '<div class="card"><div class="card-title">Exercise Logs</div><div class="exercise-log-filters"><select class="input" id="exCatFilter"><option value="__all__">All categories</option>'+cats.map(c=>'<option value="'+esc(c)+'" '+(workoutExCatFilter===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select><label class="input workout-day-filter">Workout day <input id="workoutDayFilter" type="date" value="'+selectedDate+'"></label></div>'+
     (actualRows.filter(x=>workoutExCatFilter==='__all__'||x.p.category===workoutExCatFilter).length ? table(['Exercise','Category','Sets','Reps','Weight',''],actualRows.filter(x=>workoutExCatFilter==='__all__'||x.p.category===workoutExCatFilter).map(({p,a})=>'<tr><td>'+esc(p.name)+'</td><td><span class="badge badge-low">'+esc(p.category)+'</span></td><td class="mono">'+Number(a.sets||0)+'</td><td class="mono">'+Number(a.reps||0)+'</td><td class="mono">'+Number(a.weight||0)+' kg</td><td><button type="button" class="btn-icon workout-edit-btn" title="Edit workout log" data-plan-id="'+esc(p.id)+'" data-log-date="'+esc(a.date)+'" >✎</button><button type="button" class="btn-icon workout-delete-btn" title="Delete workout log" data-plan-id="'+esc(p.id)+'" data-log-date="'+esc(a.date)+'" >✕</button></td></tr>')) : '<div class="empty">No actual workout logs for this workout day and category.</div>')+
   '</div>'+
   '<div class="card"><div class="card-title">Exercise Setup</div>'+
     (state.workout.exercisePlans.length?table(['Exercise','Category','Scheduled days',''],state.workout.exercisePlans.map(p=>'<tr><td>'+esc(p.name)+'</td><td><span class="badge badge-low">'+esc(p.category)+'</span></td><td class="mono">'+((p.weekdays||[]).map(i=>DOW_LABELS[i]).join(', ')||'—')+'</td><td><button class="btn-icon" onclick="openEditExercisePlanModal(\''+p.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteExLog(\''+p.id+'\')">✕</button></td></tr>')):'<div class="empty">No exercises configured yet.</div>')+
   '</div>'+
   '<div class="card"><div class="card-head-row"><div class="card-title">Body Weight</div><button class="icon-add-btn" onclick="openBodyWeightModal()">+</button></div>'+((state.workout.bodyWeights||[]).length?(state.workout.bodyWeights||[]).sort((a,b)=>b.date.localeCompare(a.date)).map(w=>'<div class="life-management-row"><span class="mono">'+fmtDateShort(w.date)+'</span><span class="ev-title">'+Number(w.weight).toFixed(1)+' kg</span><button class="btn-icon" onclick="openEditBodyWeightModal(\''+w.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteBodyWeight(\''+w.id+'\')">✕</button></div>').join(''):'<div class="empty">No body weight entries yet.</div>')+'</div>'+
   '<div class="card"><div class="card-title">Meditations</div>' +table(['Date','Name','Duration','Note',''],sessions.map(s=>'<tr><td class="mono">'+fmtDateShort(s.date)+'</td><td>'+esc(s.name)+'</td><td class="mono">'+fmtClock(s.durationMs)+'</td><td class="text-faint">'+esc(s.note||'')+'</td><td><button class="btn-icon" onclick="openEditMeditationModal(\''+s.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteMeditation(\''+s.id+'\')">✕</button></td></tr>'))+'</div>';
  const exCatFilterEl=document.getElementById('exCatFilter'); if(exCatFilterEl) exCatFilterEl.addEventListener('change',e=>{workoutExCatFilter=e.target.value;renderWorkout();});
  const dayEl=document.getElementById('workoutDayFilter'); if(dayEl) dayEl.addEventListener('change',e=>{workoutLogDate=e.target.value||todayStr();renderWorkout();});
}

// Robust delegated handlers: one handler only, so Workout edit/delete cannot
// fire twice or get cancelled by competing inline/direct handlers.
if(!window.__workoutActionDelegationV44){
  window.__workoutActionDelegationV44=true;
  document.addEventListener('click',function(ev){
    const edit=ev.target.closest && ev.target.closest('.workout-edit-btn');
    if(edit){ ev.preventDefault(); ev.stopImmediatePropagation(); openWorkoutSessionModal(edit.dataset.planId,edit.dataset.logDate); return; }
    const del=ev.target.closest && ev.target.closest('.workout-delete-btn');
    if(del){ ev.preventDefault(); ev.stopImmediatePropagation(); actDeleteWorkoutLog(del.dataset.planId,del.dataset.logDate); return; }
  },false);
}

/* ---------- MEALS ---------- */
function addMealModalHtml(defaultCategory){ defaultCategory=defaultCategory||'';
  return '<form id="modalForm" class="form-col">'+
    '<div class="form-row"><input required name="date" type="date" class="input" value="'+todayStr()+'" /><select name="category" class="input"><option value="">Category (optional)</option>'+MEAL_CATEGORIES.map(c=>'<option value="'+c+'" '+(c===defaultCategory?'selected':'')+'>'+c+'</option>').join('')+'</select></div>'+
    '<input required name="name" placeholder="Meal" class="input" />'+
    '<div class="form-row"><input required name="cal" type="number" placeholder="Calories" class="input" /><input required name="protein" type="number" placeholder="Protein (g)" class="input" /></div>'+
    '<button class="btn btn-primary" type="submit">Add Meal</button>'+
  '</form>';
}
function openAddMealModal(defaultCategory){
  openModal('Add Meal', addMealModalHtml(defaultCategory||''));
  bindModalSubmit(actAddMeal);
}
async function actAddMeal(e){ e.preventDefault(); const f=e.target; state.meals.entries.push({id:uid(),date:f.date.value,name:f.name.value.trim(),cal:Number(f.cal.value),protein:Number(f.protein.value),category:f.category.value}); await save('meals'); renderMeals(); }
async function actDeleteMeal(id){ if(!(await confirmDelete('Do you want to delete this meal?'))) return; state.meals.entries=state.meals.entries.filter(e=>e.id!==id); await markTombstone('meals.entries',id); await save('meals'); renderMeals(); }
async function actUpdateMealGoal(e){ e.preventDefault(); const f=e.target; state.meals.goal={cal:Number(f.cal.value),protein:Number(f.protein.value)}; await save('meals'); renderMeals(); }

function addPrepModalHtml(){
  return '<form id="modalForm" class="form-col">'+
    '<input required name="name" placeholder="Prepped meal name" class="input" />'+
    '<select required name="category" class="input"><option value="" disabled selected>Category</option>'+MEAL_CATEGORIES.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select>'+
    '<div class="form-row"><input required name="cal" type="number" min="0" placeholder="Calories" class="input" /><input required name="protein" type="number" min="0" placeholder="Protein (g)" class="input" /></div>'+
    '<div class="form-row"><input required name="start" type="date" class="input" value="'+todayStr()+'" /><input required name="end" type="date" class="input" value="'+todayStr()+'" /></div>'+
    '<button class="btn btn-primary" type="submit">Add Meal Prep</button>'+
  '</form>';
}
function openAddPrepModal(){ openModal('Add Meal Prep', addPrepModalHtml()); bindModalSubmit(actAddPrep); }
async function actAddPrep(e){ e.preventDefault(); const f=e.target; state.meals.preps.push({id:uid(),name:f.name.value.trim(),category:f.category.value,cal:Number(f.cal.value),protein:Number(f.protein.value),start:f.start.value,end:f.end.value}); await save('meals'); renderMeals(); }
async function actDeletePrep(id){ if(!(await confirmDelete('Do you want to delete this meal prep plan?'))) return; state.meals.preps=state.meals.preps.filter(p=>p.id!==id); await markTombstone('meals.preps',id); await save('meals'); renderMeals(); }
async function actSetPrepLog(prepId,status){
  const prep=(state.meals.preps||[]).find(p=>p.id===prepId);
  if(!prep) return;
  const key=prepLogKey(todayStr(),prepId);
  const current=state.meals.prepLogs[key];
  const currentStatus=typeof current==='string'?current:current&&current.status;
  if(currentStatus===status){
    if(status==='yes'){
      const existingId=current.entryId;
      if(existingId) state.meals.entries=state.meals.entries.filter(e=>e.id!==existingId);
    }
    delete state.meals.prepLogs[key];
  }else if(status==='yes'){
    const entry={id:uid(),date:todayStr(),name:prep.name,cal:Number(prep.cal||0),protein:Number(prep.protein||0),category:prep.category,sourcePrepId:prep.id};
    state.meals.entries.push(entry);
    state.meals.prepLogs[key]={status:'yes',entryId:entry.id};
  }else{
    state.meals.prepLogs[key]={status:'no'};
    openModal('Meal not followed', '<div class="form-col"><div class="text-faint">No problem. Log what you actually ate instead.</div><button class="btn btn-primary" onclick="closeModal();openAddMealModal(\''+String(prep.category).replace(/'/g,"\\'")+'\')">Add Meal</button></div>');
  }
  await save('meals');
  renderTab();
}

function renderMeals(){
  const main=document.getElementById('main');
  const period=globalPeriod;
  const entries=[...state.meals.entries].filter(e=>inRange(e.date,period)).sort((a,b)=>b.date.localeCompare(a.date));
  const t=mealsToday();
  main.innerHTML =
   '<div class="page-head"><div class="page-quote">Fuel, measured.</div></div>'+
   dateFilterBar()+
   '<div class="card"><div class="card-title">Today</div><div class="vitals">'+
     '<div class="vital"><div class="vital-label">Calories</div><div class="mono vital-value">'+t.cal+' / '+state.meals.goal.cal+' kcal</div>'+progressBar(t.cal/state.meals.goal.cal*100,'var(--c-amber)')+'</div>'+
     '<div class="vital"><div class="vital-label">Protein</div><div class="mono vital-value">'+t.protein+' / '+state.meals.goal.protein+' g</div>'+progressBar(t.protein/state.meals.goal.protein*100,'var(--c-sage)')+'</div>'+
   '</div><form id="goalForm" class="form-row" style="margin-top:14px"><input name="cal" type="number" placeholder="Cal goal" class="input" value="'+state.meals.goal.cal+'" /><input name="protein" type="number" placeholder="Protein goal (g)" class="input" value="'+state.meals.goal.protein+'" /><button class="btn btn-ghost" type="submit">Update Goal</button></form></div>'+
   '<div class="card"><div class="card-head-row"><div class="card-title">Meal Prep Plan</div><button class="icon-add-btn" onclick="openAddPrepModal()">+</button></div>'+
     (state.meals.preps&&state.meals.preps.length? '<div class="life-management-list">'+[...state.meals.preps].sort((a,b)=>b.start.localeCompare(a.start)).map(p=>'<div class="life-management-row"><span class="badge badge-low">'+esc(p.category)+'</span><span class="ev-title">'+esc(p.name)+'</span><span class="mono text-faint">'+fmtDateShort(p.start)+' – '+fmtDateShort(p.end)+'</span><button class="btn-icon" onclick="actDeletePrep(\''+p.id+'\')">✕</button></div>').join('')+'</div>' : '<div class="empty">No meal preps planned. Add one for a date range (e.g. a week of batch-cooked meals) to track whether you stick to it.</div>')+
   '</div>'+
   mealPrepTodayCardHtml()+
   '<div class="card"><div class="card-head-row"><div class="card-title">Log</div><button class="icon-add-btn" onclick="openAddMealModal()">+</button></div>'+
     table(['Date','Category','Meal','Cal','Protein',''], entries.map(e=>'<tr><td class="mono">'+fmtDateShort(e.date)+'</td><td>'+(e.category?'<span class="badge badge-low">'+esc(e.category)+'</span>':'<span class="text-faint">—</span>')+'</td><td>'+esc(e.name)+'</td><td class="mono">'+e.cal+'</td><td class="mono">'+e.protein+' g</td><td><button class="btn-icon" onclick="openEditMealModal (\''+e.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteMeal(\''+e.id+'\')">✕</button></td></tr>'))+
   '</div>';
  document.getElementById('goalForm').addEventListener('submit', actUpdateMealGoal);
}

/* ---------- SLEEP & WATER ---------- */
function sleepStatus(dur,goal,type){ if(type==='nap') return '<span class="badge badge-low">Nap</span>'; if(dur>goal) return '<span class="badge badge-medium">Oversleeping</span>'; if(dur<goal) return '<span class="badge badge-high">Short</span>'; return '<span class="badge badge-done">Goal reached</span>'; }
function sleepEntryDuration(e){ return sleepDuration(e.bed,e.wake); }
function addSleepModalHtml(){ return '<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+todayStr()+'"/><select required name="type" class="input"><option value="night">Night sleep</option><option value="nap">Nap</option></select><div class="form-row"><input required name="bed" type="time" class="input"/><input required name="wake" type="time" class="input"/></div><button class="btn btn-primary" type="submit">Add Sleep</button></form>'; }
function openAddSleepModal(){ openModal('Log Sleep',addSleepModalHtml()); bindModalSubmit(actAddSleep); }
async function actAddSleep(e){ e.preventDefault(); const f=e.target; state.sleep.entries.push({id:uid(),date:f.date.value,type:f.type.value,bed:f.bed.value,wake:f.wake.value}); await save('sleep'); renderSleepWater(); }
async function actUpdateSleepGoal(e){ e.preventDefault(); const f=e.target; state.sleep.goalHours=Number(f.goalHours.value)||8; await save('sleep'); renderSleepWater(); }
async function actDeleteSleep(id){ if(!(await confirmDelete('Do you want to delete this record?'))) return; state.sleep.entries=state.sleep.entries.filter(e=>e.id!==id); await markTombstone('sleep.entries',id); await save('sleep'); renderSleepWater(); }
function renderSleepWater(){
  const main=document.getElementById('main'); const period=globalPeriod; const sleepEntries=[...state.sleep.entries].filter(e=>inRange(e.date,period)).sort((a,b)=>b.date.localeCompare(a.date)); const waterEntries=[...state.water.entries].filter(e=>inRange(e.date,period)).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const dates=last7Dates(); const recent=state.sleep.entries.filter(e=>dates.includes(e.date)&&(e.type||'night')!=='nap'); const avg=recent.length?(recent.reduce((s,e)=>s+sleepEntryDuration(e),0)/recent.length).toFixed(1):'--'; const todayWater=waterToday();
  main.innerHTML='<div class="page-head"><div class="page-quote">Rest, hydrate, repeat.</div></div>'+dateFilterBar()+'<div class="card-grid stat-grid">'+statCard('7-day Sleep Avg',avg+(avg!=='--'?' h':''),'','var(--c-blue)')+statCard('Nights Logged',state.sleep.entries.filter(e=>(e.type||'night')!=='nap').length,'','var(--c-sage)')+statCard('Today Water',todayWater+' / '+state.water.goal+' ml','','var(--c-blue)')+'</div>'+
  '<div class="card"><div class="card-title">Sleep Goal</div><form id="sleepGoalForm" class="form-row"><input name="goalHours" type="number" step="0.5" class="input" value="'+state.sleep.goalHours+'" placeholder="Goal hours"/><button class="btn btn-ghost" type="submit">Update Goal</button></form></div>'+
  '<div class="card"><div class="card-head-row"><div class="card-title">Sleep Log</div><button class="icon-add-btn" onclick="openAddSleepModal()">+</button></div>'+table(['Date','Type','Bed','Wake','Duration','Status',''],sleepEntries.map(e=>{const dur=sleepEntryDuration(e);const type=e.type||'night';return '<tr><td class="mono">'+fmtDateShort(e.date)+'</td><td><span class="badge '+(type==='nap'?'badge-low':'badge-done')+'">'+(type==='nap'?'Nap':'Night')+'</span></td><td class="mono">'+e.bed+'</td><td class="mono">'+e.wake+'</td><td class="mono">'+dur.toFixed(1)+' h</td><td>'+sleepStatus(dur,state.sleep.goalHours,type)+'</td><td><button class="btn-icon" onclick="openEditSleepModal(\''+e.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteSleep(\''+e.id+'\')">✕</button></td></tr>'; }))+'</div>'+
  '<div class="card"><div class="card-head-row"><div class="card-title">Water</div><div class="quick-add"><button class="btn btn-ghost" onclick="actAddWater(250)">+250 ml</button><button class="btn btn-ghost" onclick="actAddWater(500)">+500 ml</button><button class="btn btn-ghost" onclick="actAddWater(1000)">+1000 ml</button><button class="btn btn-ghost" onclick="actAddWater(-250)">−250 ml</button><button class="btn btn-ghost" onclick="actAddWater(-500)">−500 ml</button></div></div><div class="card-title" style="font-size:14px;margin-top:4px">Today — '+todayWater+' / '+state.water.goal+' ml</div>'+progressBar(todayWater/state.water.goal*100,'var(--c-blue)')+'<form id="goalWaterForm" class="form-row" style="margin-top:14px"><input name="goal" type="number" class="input" value="'+state.water.goal+'" placeholder="Daily goal (ml)"/><button class="btn btn-ghost" type="submit">Update Goal</button></form></div>';
  document.getElementById('sleepGoalForm').addEventListener('submit',actUpdateSleepGoal); document.getElementById('goalWaterForm').addEventListener('submit',actUpdateWaterGoal);
}
function renderSleep(){renderSleepWater();} function renderWater(){renderSleepWater();}
async function actAddWater(amount){const now=new Date();const current=waterToday();let delta=Number(amount)||0;if(delta<0) delta=-Math.min(Math.abs(delta),current);if(delta===0)return;state.water.entries.push({id:uid(),date:todayStr(),amount:delta,time:now.toTimeString().slice(0,5)});await save('water');renderSleepWater();}
async function actUpdateWaterGoal(e){e.preventDefault();const f=e.target;state.water.goal=Number(f.goal.value)||2000;await save('water');renderSleepWater();}
async function actDeleteWater(id){if(!(await confirmDelete('Do you want to delete this water log?'))) return;state.water.entries=state.water.entries.filter(e=>e.id!==id);await markTombstone('water.entries',id);await save('water');renderSleepWater();}

/* ---------- CALENDAR ---------- */
const CALENDAR_CATEGORIES=['Event','Task','Errands','Reminder','Meeting'];
function calendarCategories(){
  const custom=(state.calendar.customCategories||[]).map(c=>c.name).filter(Boolean);
  return [...CALENDAR_CATEGORIES,...custom.filter(c=>!CALENDAR_CATEGORIES.includes(c))];
}
function calendarCategoryColor(category){
  const built={Event:'var(--c-sage)',Task:'var(--c-amber)',Errands:'var(--c-blue)',Reminder:'var(--c-coral)',Meeting:'#8b5cf6'};
  if(built[category]) return built[category];
  const x=(state.calendar.customCategories||[]).find(c=>c.name===category);
  return x&&x.color ? x.color : 'var(--c-sage)';
}
function calendarCategoryBadge(category){
  const c=category||'Event';
  const cls=c==='Task'?'medium':c==='Errands'?'low':c==='Reminder'?'high':'done';
  const custom=!CALENDAR_CATEGORIES.includes(c);
  return '<span class="badge badge-'+cls+'"'+(custom||c==='Meeting'?' style="border-color:'+calendarCategoryColor(c)+';color:'+calendarCategoryColor(c)+'"':'')+'>'+esc(c)+'</span>';
}
function calendarCategoryOptions(selected){
  return calendarCategories().map(c=>'<option value="'+esc(c)+'" '+(c===selected?'selected':'')+'>'+esc(c)+'</option>').join('');
}
function addCalendarCategoryModal(){
  openModal('Add Calendar Category','<form id="modalForm" class="form-col"><input required name="name" maxlength="30" class="input" placeholder="Category name"/><label class="text-faint">Choose a color</label><input required name="color" type="color" value="#38bdf8" style="width:100%;height:44px;padding:4px"/><button class="btn btn-primary" type="submit">Add Category</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;const name=f.name.value.trim();const color=/^#[0-9a-fA-F]{6}$/.test(f.color.value)?f.color.value:'#38bdf8';if(!name)return;if(calendarCategories().some(c=>c.toLowerCase()===name.toLowerCase())){alert('That category already exists.');return;}state.calendar.customCategories.push({name,color});await save('calendar');closeModal();openAddEventModal(calSelected,name);});
}
function addEventModalHtml(dateStr,selectedCategory){
  const d=dateStr||calSelected; const cat=selectedCategory||'Event';
  return '<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+d+'" /><input name="time" type="time" class="input" /><div class="form-row"><select required name="category" class="input">'+calendarCategoryOptions(cat)+'</select><button type="button" class="btn btn-secondary" onclick="addCalendarCategoryModal()">+</button></div><input required name="title" placeholder="Title" class="input" /><textarea name="notes" class="input" rows="4" placeholder="Notes (optional)"></textarea><select name="priority" class="input"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select><button class="btn btn-primary" type="submit">Add</button></form>';
}
function openAddEventModal(dateStr,selectedCategory){ openModal('Add to Calendar',addEventModalHtml(dateStr,selectedCategory)); bindModalSubmit(actAddEvent); }
async function actAddEvent(e){ e.preventDefault(); const f=e.target; state.calendar.events.push({id:uid(),date:f.date.value,time:f.time.value,title:f.title.value.trim(),notes:f.notes.value.trim(),category:f.category.value,priority:f.priority.value,done:false}); await save('calendar'); calSelected=f.date.value; closeModal(); renderCalendar(); openCalendarDayModal(calSelected); }
async function actToggleCalendarItem(id){ const item=state.calendar.events.find(x=>x.id===id); if(!item)return; if(item.category==='Task' || item.category==='Errands'){ item.done=!item.done; item.completedDate=item.done?todayStr():null; await save('calendar'); renderCalendar(); } }
async function actDeleteEvent(id){ const item=state.calendar.events.find(e=>e.id===id); if(!item)return; const categoryLabel=({Event:'event',Task:'task',Errands:'errand',Reminder:'reminder',Meeting:'meeting'})[item.category]||item.category.toLowerCase(); if(!(await confirmDelete('Do you want to delete this '+categoryLabel+'?'))) return; state.calendar.events=state.calendar.events.filter(e=>e.id!==id); await markTombstone('calendar.events',id); await save('calendar'); closeModal(); renderCalendar(); openCalendarDayModal(calSelected); }
function openCalendarNotesModal(id){ const x=state.calendar.events.find(e=>e.id===id); if(!x)return; openModal(x.title,'<form id="modalForm" class="form-col"><div class="text-faint">'+calendarCategoryBadge(x.category)+' '+fmtDateLong(x.date)+(x.time?' · '+esc(x.time):'')+'</div><textarea required name="notes" class="input" rows="8" style="resize:vertical;min-height:160px" placeholder="Add notes...">'+esc(x.notes||'')+'</textarea><button class="btn btn-primary" type="submit">Save Notes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();x.notes=e.target.notes.value.trim();await save('calendar');closeModal();renderCalendar();}); }
function openEditEventModal(id){ const x=state.calendar.events.find(e=>e.id===id); if(!x)return; openModal('Edit Calendar Item','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+x.date+'"/><input name="time" type="time" class="input" value="'+(x.time||'')+'"/><div class="form-row"><select required name="category" class="input">'+calendarCategoryOptions(x.category)+'</select><button type="button" class="btn btn-secondary" onclick="addCalendarCategoryModal()">+</button></div><input required name="title" class="input" value="'+esc(x.title)+'"/><textarea name="notes" class="input" rows="4" placeholder="Notes (optional)">'+esc(x.notes||'')+'</textarea><select name="priority" class="input"><option value="low" '+(x.priority==='low'?'selected':'')+'>Low</option><option value="medium" '+(x.priority==='medium'?'selected':'')+'>Medium</option><option value="high" '+(x.priority==='high'?'selected':'')+'>High</option></select><button class="btn btn-primary" type="submit">Save Changes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{date:f.date.value,time:f.time.value,title:f.title.value.trim(),notes:f.notes.value.trim(),category:f.category.value,priority:f.priority.value});calSelected=x.date;await save('calendar');closeModal();renderCalendar();openCalendarDayModal(x.date);}); }
function actCalNav(dir){ calMonth+=dir; if(calMonth<0){calMonth=11; calYear--;} if(calMonth>11){calMonth=0; calYear++;} renderCalendar(); }
function actCalSelect(dk){ calSelected=dk; openCalendarDayModal(dk); }
function openCalendarDayModal(dateStr){
  const items=(state.calendar.events||[]).filter(e=>e.date===dateStr).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
  const rows=items.length?'<div class="life-management-list">'+items.map(e=>'<div class="life-management-row">'+calendarCategoryBadge(e.category)+'<span class="mono">'+(e.time||'--:--')+'</span><span class="ev-title '+(e.done?'strike':'')+'">'+esc(e.title)+'</span><button class="btn-icon" onclick="openEditEventModal(\''+e.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteEvent(\''+e.id+'\')">✕</button></div>').join('')+'</div>':'<div class="empty">Nothing scheduled for this day.</div>';
  openModal(fmtDateLong(dateStr),'<div class="form-col">'+rows+'<div class="form-row" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-primary" onclick="closeModal();openAddEventModal(\''+dateStr+'\')">+ Add</button></div></div>');
}
function renderCalendar(){
  const main=document.getElementById('main'); const cells=monthMatrix(calYear,calMonth); const monthLabel=new Date(calYear,calMonth,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const byDate={}; (state.calendar.events||[]).forEach(e=>{(byDate[e.date]=byDate[e.date]||[]).push(e);});
  const allLogs=[...(state.calendar.events||[])].filter(e=>inRange(e.date,globalPeriod)).sort((a,b)=>(a.date+(a.time||'99:99')).localeCompare(b.date+(b.time||'99:99')));
  const allLogHtml=allLogs.length?'<div class="life-management-list">'+allLogs.map(e=>{const actionable=e.category==='Task'||e.category==='Errands'; const check=actionable?'<button class="check '+(e.done?'checked':'')+'" onclick="event.stopPropagation();actToggleCalendarItem(\''+e.id+'\')" aria-label="Mark '+esc(e.category)+' complete"></button>':'<span style="width:36px;flex:none"></span>'; return '<div class="life-management-row" style="cursor:pointer" onclick="openCalendarNotesModal(\''+e.id+'\')">'+calendarCategoryBadge(e.category)+'<span class="mono text-faint">'+fmtDateShort(e.date)+'</span><span class="mono">'+(e.time||'--:--')+'</span><span class="ev-title '+(e.done?'strike':'')+'">'+esc(e.title)+(e.notes?' <span class="badge badge-low">Notes</span>':'')+'</span>'+check+'<button class="btn-icon" onclick="event.stopPropagation();openEditEventModal(\''+e.id+'\')">✎</button><button class="btn-icon" onclick="event.stopPropagation();actDeleteEvent(\''+e.id+'\')">✕</button></div>';}).join('')+'</div>':'<div class="empty">No calendar items for this period.</div>';
  main.innerHTML='<div class="page-head"><div class="page-quote">What\'s ahead.</div></div>'+dateFilterBar()+
    '<div class="card"><div class="cal-nav"><button class="btn-icon" onclick="actCalNav(-1)">‹</button><div class="cal-month">'+monthLabel+'</div><button class="btn-icon" onclick="actCalNav(1)">›</button></div><div class="cal-grid">'+['S','M','T','W','T','F','S'].map(d=>'<div class="cal-dow">'+d+'</div>').join('')+cells.map(day=>{if(day===null)return '<div class="cal-cell empty-cell"></div>';const dk=dateKey(calYear,calMonth,day);const items=byDate[dk]||[];const isToday=dk===todayStr(),isSel=dk===calSelected;const cats=[...new Set(items.map(e=>e.category||'Event'))];return '<div class="cal-cell '+(isSel?'selected ':'')+(isToday?'is-today':'')+'" onclick="actCalSelect(\''+dk+'\')"><span class="cal-daynum">'+day+'</span>'+(items.length?'<span class="cal-count">'+items.length+'</span>':'')+(cats.length?'<div style="display:flex;gap:2px;position:absolute;bottom:4px">'+cats.slice(0,4).map(c=>'<span style="width:4px;height:4px;border-radius:50%;background:'+calendarCategoryColor(c)+'"></span>').join('')+'</div>':'')+'</div>';}).join('')+'</div></div>'+
    
       '<div class="card calendar-all-logs-card"><div class="card-title">All Logs</div><div class="text-faint" style="margin-bottom:10px">Connected to the date filter above.</div>'+allLogHtml+'</div>';
}

/* ---------- READING ---------- */
function addBookModalHtml(){ return '<form id="modalForm" class="form-row"><input required name="title" placeholder="Title" class="input" /><input name="author" placeholder="Author" class="input" /><input required name="pages" type="number" placeholder="Total pages" class="input" /><select name="status" class="input"><option value="want">Want to Read</option><option value="reading">Reading</option><option value="done">Finished</option></select><button class="btn btn-primary" type="submit">Add</button></form>'; }
function openAddBookModal(){ openModal('Add Book', addBookModalHtml()); bindModalSubmit(actAddBook); }
async function actAddBook(e){ e.preventDefault(); const f=e.target; state.reading.books.push({id:uid(),title:f.title.value.trim(),author:f.author.value.trim(),pages:Number(f.pages.value),current:0,status:f.status.value,notes:'',addedDate:todayStr()}); await save('reading'); renderReading(); }
async function actUpdatePage(id,val){ const b=state.reading.books.find(x=>x.id===id); if(b) b.current=Number(val); await save('reading'); renderReading(); }
async function actUpdateStatus(id,val){ const b=state.reading.books.find(x=>x.id===id); if(b) b.status=val; await save('reading'); renderReading(); }
async function actDeleteBook(id){ if(!(await confirmDelete('Do you want to delete this book?'))) return; state.reading.books=state.reading.books.filter(b=>b.id!==id); await markTombstone('reading.books',id); await save('reading'); renderReading(); }
function notesModalHtml(book){ return '<div class="form-col"><textarea id="bookNotesArea" class="input" rows="8" style="resize:vertical;min-height:140px;font-family:var(--font-body)" placeholder="Your notes...">'+esc(book.notes||'')+'</textarea><button class="btn btn-primary" onclick="actSaveBookNotes(\''+book.id+'\')">Save Notes</button></div>'; }
function openBookNotesModal(id){ const book=state.reading.books.find(b=>b.id===id); if(!book) return; openModal(book.title, notesModalHtml(book)); }
async function actSaveBookNotes(id){ const book=state.reading.books.find(b=>b.id===id); if(!book) return; const ta=document.getElementById('bookNotesArea'); book.notes=ta?ta.value:book.notes; await save('reading'); closeModal(); renderReading(); }

function renderReading(){
  const main=document.getElementById('main');
  const rank={reading:0,want:1,done:2};
  const period=globalPeriod;
  const books=[...state.reading.books].filter(b=>inRange(b.addedDate||todayStr(),period)).sort((a,b)=>rank[a.status]-rank[b.status]);
  main.innerHTML =
   '<div class="page-head"><div class="page-quote">Pages turned.</div></div>'+
   dateFilterBar()+
   '<div class="card"><div class="card-head-row"><div class="card-title">Library</div><button class="icon-add-btn" onclick="openAddBookModal()">+</button></div>'+
   (books.length? '<div class="life-management-list">'+books.map(b=>{
     const pct=b.pages? Math.min(100,(b.current/b.pages*100)) : 0;
     return '<div class="book-row"><div class="book-info"><div class="ev-title" style="cursor:pointer" onclick="openBookNotesModal(\''+b.id+'\')">'+esc(b.title)+(b.author? ' <span class="text-faint">'+esc(b.author)+'</span>':'')+(b.notes?' <span class="badge badge-low">Notes</span>':'')+'</div><div class="mono text-faint">'+(b.current||0)+' / '+b.pages+' pages</div></div>'+progressBar(pct,b.status==='done'?'var(--c-sage)':'var(--c-amber)')+
     '<div class="book-controls"><input type="number" class="input input-sm" value="'+(b.current||0)+'" onchange="actUpdatePage(\''+b.id+'\', this.value)" /><select class="input input-sm" onchange="actUpdateStatus(\''+b.id+'\', this.value)"><option value="want" '+(b.status==='want'?'selected':'')+'>Want</option><option value="reading" '+(b.status==='reading'?'selected':'')+'>Reading</option><option value="done" '+(b.status==='done'?'selected':'')+'>Done</option></select><button class="btn-icon" onclick="openEditBookModal (\''+b.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteBook(\''+b.id+'\')">✕</button></div></div>';
   }).join('')+'</div>' : '<div class="empty">No books yet.</div>')+
   '</div>';
}


/* ---------- JOURNAL ---------- */
function journalFormHtml(){
  return '<form id="modalForm" class="form-col">'+
    '<input required name="date" type="date" class="input" value="'+todayStr()+'" />'+
    '<input required name="title" placeholder="Entry title" class="input" />'+
    '<textarea required name="body" rows="7" class="input" placeholder="Write what happened, what you learned, what you are thinking..."></textarea>'+
    '<button class="btn btn-primary" type="submit">Save Entry</button>'+
  '</form>';
}
function openJournalModal(){ openModal('New Journal Entry',journalFormHtml()); bindModalSubmit(actAddJournal); }
async function actAddJournal(e){ e.preventDefault(); const f=e.target; state.journal.entries.push({id:uid(),date:f.date.value,title:f.title.value.trim(),body:f.body.value.trim(),createdAt:new Date().toISOString()}); await save('journal'); renderJournal(); }
async function actDeleteJournal(id){ if(!(await confirmDelete('Do you want to delete this journal entry?'))) return; state.journal.entries=state.journal.entries.filter(x=>x.id!==id); await markTombstone('journal.entries',id); await save('journal'); renderJournal(); }



function openJournalViewModal(id){ const x=state.journal.entries.find(e=>e.id===id); if(!x)return; openModal(x.title||'Journal Entry','<div class="form-col"><div class="text-faint">'+fmtDateLong(x.date)+'</div><div class="journal-body" style="white-space:pre-wrap">'+esc(x.body||'')+'</div></div>'); }
function openGratitudeViewModal(id){ const x=state.journal.gratitude.find(g=>g.id===id); if(!x)return; openModal('Gratitude','<div class="form-col"><div class="text-faint">'+fmtDateLong(x.date)+'</div><div class="journal-body" style="white-space:pre-wrap">'+esc(x.text||'')+'</div></div>'); }
function renderJournal(){
  const main=document.getElementById('main'); const period=globalPeriod;
  const entries=[...state.journal.entries].filter(e=>inRange(e.date,period)).sort((a,b)=>b.date.localeCompare(a.date));
  const gratitude=[...state.journal.gratitude].filter(g=>inRange(g.date,period)).sort((a,b)=>b.date.localeCompare(a.date));
  main.innerHTML='<div class="page-head"><div class="page-quote">Write it down. Make it useful.</div></div>'+dateFilterBar()+
    '<div class="card"><div class="card-head-row"><div class="card-title">Journal</div><button class="icon-add-btn" onclick="openJournalModal()">+</button></div>'+
    (entries.length?'<div class="life-management-list">'+entries.map(e=>'<div class="life-management-row" style="cursor:pointer" onclick="openJournalViewModal(\''+e.id+'\')"><span class="mono text-faint">'+fmtDateShort(e.date)+'</span><span class="ev-title">'+esc(e.title)+'</span><span style="margin-left:auto"><button class="btn-icon" onclick="event.stopPropagation();openEditJournalModal(\''+e.id+'\')">✎</button><button class="btn-icon" onclick="event.stopPropagation();actDeleteJournal(\''+e.id+'\')">✕</button></span></div>').join('')+'</div>':'<div class="empty">No journal entries for this period.</div>')+'</div>'+
    '<div class="card"><div class="card-head-row"><div class="card-title">Gratitude</div><button class="icon-add-btn" onclick="openGratitudeModal()">+</button></div>'+
    (gratitude.length?'<div class="life-management-list">'+gratitude.map(g=>'<div class="life-management-row" style="cursor:pointer" onclick="openGratitudeViewModal(\''+g.id+'\')"><span class="mono text-faint">'+fmtDateShort(g.date)+'</span><span class="ev-title">'+esc(g.text)+'</span><span style="margin-left:auto"><button class="btn-icon" onclick="event.stopPropagation();openEditGratitudeModal(\''+g.id+'\')">✎</button><button class="btn-icon" onclick="event.stopPropagation();actDeleteGratitude(\''+g.id+'\')">✕</button></span></div>').join('')+'</div>':'<div class="empty">No gratitude entries for this period.</div>')+'</div>';
}

function gratitudeModalHtml(){
  return '<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+todayStr()+'" /><textarea required name="text" class="input" rows="4" placeholder="What are you grateful for today?"></textarea><button class="btn btn-primary" type="submit">Save Gratitude</button></form>';
}
function openGratitudeModal(){ openModal('Gratitude Log',gratitudeModalHtml()); bindModalSubmit(actAddGratitude); }
async function actAddGratitude(e){ e.preventDefault(); const f=e.target; state.journal.gratitude.push({id:uid(),date:f.date.value,text:f.text.value.trim()}); await save('journal'); renderJournal(); }
function openEditGratitudeModal(id){
  const g=state.journal.gratitude.find(x=>x.id===id); if(!g) return;
  openModal('Edit Gratitude','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+g.date+'" /><textarea required name="text" class="input" rows="4">'+esc(g.text)+'</textarea><button class="btn btn-primary" type="submit">Save Changes</button></form>');
  bindModalSubmit(async e=>{e.preventDefault();const f=e.target;g.date=f.date.value;g.text=f.text.value.trim();await save('journal');renderJournal();});
}
async function actDeleteGratitude(id){ if(!(await confirmDelete('Do you want to delete this gratitude entry?'))) return; state.journal.gratitude=state.journal.gratitude.filter(x=>x.id!==id); await markTombstone('journal.gratitude',id); await save('journal'); renderJournal(); }

/* ---------- GROCERIES ---------- */
const GROCERY_CATEGORIES=['Produce','Meat & Seafood','Dairy','Bakery','Pantry','Frozen','Snacks','Beverages','Household','Personal Care','Other'];
function groceryCategoryOptions(selected){ return GROCERY_CATEGORIES.map(c=>'<option value="'+c+'" '+(selected===c?'selected':'')+'>'+c+'</option>').join(''); }
function groceryFormHtml(){ return '<form id="modalForm" class="form-col"><div class="form-row"><input required name="item" placeholder="Grocery item" class="input"/><input name="qty" placeholder="Qty" class="input"/></div><div class="form-row"><select required name="category" class="input"><option value="">Category</option>'+groceryCategoryOptions('')+'</select><input name="price" type="number" min="0" step="0.01" placeholder="Amount (optional)" class="input"/><input required name="date" type="date" class="input" value="'+todayStr()+'"/></div><button class="btn btn-primary" type="submit">Add</button></form>'; }
function openGroceryModal(){ openModal('Add Grocery Item',groceryFormHtml()); bindModalSubmit(actAddGrocery); }
async function actAddGrocery(e){ e.preventDefault(); const f=e.target; state.groceries.items.push({id:uid(),item:f.item.value.trim(),qty:f.qty.value.trim(),category:f.category.value.trim(),date:f.date.value||todayStr(),price:Number(f.price.value)||0,done:false}); await save('groceries'); renderGroceries(); }
async function actToggleGrocery(id){ const x=state.groceries.items.find(i=>i.id===id); if(x) x.done=!x.done; await save('groceries'); renderGroceries(); }
async function actDeleteGrocery(id){ if(!(await confirmDelete('Do you want to delete this grocery item?'))) return; state.groceries.items=state.groceries.items.filter(x=>x.id!==id); await markTombstone('groceries.items',id); await save('groceries'); renderGroceries(); }
function renderGroceries(){
  const main=document.getElementById('main'); const period=globalPeriod;
  const logs=[...state.groceries.items].filter(x=>inRange(x.date||todayStr(),period)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  main.innerHTML='<div class="page-head"><div class="page-quote">Buy what supports the plan.</div></div>'+dateFilterBar()+
    '<div class="card"><div class="card-head-row"><div class="card-title">All Logs</div><div style="display:flex;align-items:center;gap:8px"><label class="input" style="display:inline-flex;align-items:center;gap:8px;margin:0">Date <input id="groceryDateFilter" type="date" value="'+(groceryDateFilter||todayStr())+'" style="border:0;background:transparent;color:inherit"></label><button class="icon-add-btn" onclick="openGroceryModal()">+</button></div></div>'+
    (logs.length?'<div class="life-management-list">'+logs.map(x=>'<div class="grocery-item '+(x.done?'done-row':'')+'"><button class="check '+(x.done?'checked':'')+'" onclick="actToggleGrocery(\''+x.id+'\')"></button><span class="mono text-faint">'+fmtDateShort(x.date||todayStr())+'</span><span class="ev-title '+(x.done?'strike':'')+'">'+esc(x.item)+'</span><span class="text-faint">'+esc(x.qty||'')+'</span><span class="badge badge-low">'+esc(x.category||'General')+'</span>'+(Number(x.price||0)>0?'<span class="mono">'+fmtMoney(x.price)+'</span>':'<span class="text-faint">—</span>')+'<button class="btn-icon" onclick="openEditGroceryModal(\''+x.id+'\')">✎</button><button class="btn-icon" onclick="actDeleteGrocery(\''+x.id+'\')">✕</button></div>').join('')+'</div>':'<div class="empty">No grocery logs for this period.</div>')+'</div>';
  const groceryDateFilterEl=document.getElementById('groceryDateFilter'); if(groceryDateFilterEl) groceryDateFilterEl.addEventListener('change',e=>{groceryDateFilter=e.target.value||todayStr();renderGroceries();});
}

function openEditGroceryModal(id){ const x=state.groceries.items.find(i=>i.id===id); if(!x)return; openModal('Edit Grocery Item','<form id="modalForm" class="form-col"><div class="form-row"><input required name="item" class="input" value="'+esc(x.item)+'"/><input name="qty" class="input" value="'+esc(x.qty||'')+'"/></div><div class="form-row"><select required name="category" class="input">'+groceryCategoryOptions(x.category||'')+'</select><input name="price" type="number" min="0" step="0.01" class="input" placeholder="Amount (optional)" value="'+Number(x.price||0)+'"/><input required name="date" type="date" class="input" value="'+(x.date||todayStr())+'"/></div><button class="btn btn-primary" type="submit">Save Changes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{item:f.item.value.trim(),qty:f.qty.value.trim(),category:f.category.value.trim(),price:Number(f.price.value)||0,date:f.date.value});await save('groceries');renderGroceries();}); }
function openEditMeditationModal(id){ const x=state.workout.sessions.find(s=>s.id===id); if(!x)return; openModal('Edit Meditation','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+x.date+'"/><input required name="name" class="input" value="'+esc(x.name)+'"/><input required name="duration" type="number" class="input" value="'+Math.round(Number(x.durationMs||0)/1000)+'" placeholder="Duration (seconds)"/><textarea name="note" class="input" rows="3">'+esc(x.note||'')+'</textarea><button class="btn btn-primary" type="submit">Save Changes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(x,{date:f.date.value,name:f.name.value.trim(),durationMs:Number(f.duration.value)*1000,note:f.note.value.trim()});await save('workout');renderWorkout();}); }
function openEditAccountModal(id){ const a=state.money.accounts.find(x=>x.id===id); if(!a)return; openModal('Edit Account','<form id="modalForm" class="form-col"><input required name="name" class="input" value="'+esc(a.name)+'"/><select name="type" class="input"><option '+(a.type==='Cash'?'selected':'')+'>Cash</option><option '+(a.type==='Bank'?'selected':'')+'>Bank</option><option '+(a.type==='E-wallet'?'selected':'')+'>E-wallet</option><option '+(a.type==='Credit'?'selected':'')+'>Credit</option><option '+(a.type==='Investment'?'selected':'')+'>Investment</option></select><input required name="start" type="number" step="0.01" class="input" value="'+a.start+'"/><button class="btn btn-primary" type="submit">Save Changes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(a,{name:f.name.value.trim(),type:f.type.value,start:Number(f.start.value)});await save('money');renderMoney();}); }
function openEditNoSpendModal(dateStr){ if(!state.money.noSpendDays.includes(dateStr)) return; openModal('Edit No‑Spend Day','<form id="modalForm" class="form-col"><input required name="date" type="date" class="input" value="'+dateStr+'"/><button class="btn btn-primary" type="submit">Save Changes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const next=e.target.date.value;state.money.noSpendDays=state.money.noSpendDays.filter(x=>x!==dateStr);if(!state.money.noSpendDays.includes(next)) state.money.noSpendDays.push(next);await save('money');renderMoney();}); }
function openEditPrepModal(id){ const p=state.meals.preps.find(x=>x.id===id); if(!p)return; openModal('Edit Meal Prep','<form id="modalForm" class="form-col"><input required name="name" class="input" value="'+esc(p.name)+'"/><select required name="category" class="input">'+MEAL_CATEGORIES.map(c=>'<option value="'+c+'" '+(c===p.category?'selected':'')+'>'+c+'</option>').join('')+'</select><div class="form-row"><input required name="cal" type="number" class="input" value="'+p.cal+'"/><input required name="protein" type="number" class="input" value="'+p.protein+'"/></div><div class="form-row"><input required name="start" type="date" class="input" value="'+p.start+'"/><input required name="end" type="date" class="input" value="'+p.end+'"/></div><button class="btn btn-primary" type="submit">Save Changes</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;Object.assign(p,{name:f.name.value.trim(),category:f.category.value,cal:Number(f.cal.value),protein:Number(f.protein.value),start:f.start.value,end:f.end.value});await save('meals');renderMeals();}); }
/* ---------- SETTINGS + REPORTS ---------- */
function reportRange(period){ const now=new Date(todayStr()+'T00:00:00'); let start,end; if(period==='month'){ const parts=reportMonth.split('-').map(Number), y=parts[0]||now.getFullYear(), mo=(parts[1]||now.getMonth()+1)-1; start=new Date(y,mo,1); end=new Date(y,mo+1,0); if(end>now) end=now; } else if(period==='quarter'){ start=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1); end=new Date(now.getFullYear(),start.getMonth()+3,0); if(end>now) end=now; } else { start=new Date(now.getFullYear(),0,1); end=new Date(now.getFullYear(),11,31); if(end>now) end=now; } return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}; }
function reportDates(period){ const r=reportRange(period),out=[]; for(let d=new Date(r.start+'T00:00:00');d<=new Date(r.end+'T00:00:00');d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10)); return out; }
function monthlyReportData(){
 const ym=reportMonth||todayStr().slice(0,7), r={start:ym+'-01',end:ym+'-'+String(new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate()).padStart(2,'0')};
 const inMonth=d=>d&&d>=r.start&&d<=r.end;
 const tx=state.money.transactions.filter(t=>inMonth(t.date));
 const trades=state.trading.trades.filter(t=>inMonth(t.date));
 const run=state.running.runs.filter(x=>inMonth(x.date));
 const workoutLogs=[];(state.workout.exercisePlans||[]).forEach(p=>(p.actuals||[]).forEach(a=>{if(inMonth(a.date))workoutLogs.push({...a,exercise:p.name,category:p.category||''});}));
 const meal=state.meals.entries.filter(e=>inMonth(e.date));
 const sleep=state.sleep.entries.filter(e=>inMonth(e.date));
 const water=state.water.entries.filter(e=>inMonth(e.date));
 const events=state.calendar.events.filter(e=>inMonth(e.date));
 const books=state.reading.books.filter(b=>b.status==='done'&&inMonth(b.addedDate));
 const journals=state.journal.entries.filter(j=>inMonth(j.date)), gratitude=state.journal.gratitude.filter(g=>inMonth(g.date));
 const groceries=state.groceries.items.filter(g=>inMonth(g.date||todayStr()));
 const days=[];for(let d=1;d<=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate();d++)days.push(ym+'-'+String(d).padStart(2,'0'));
 const doneDays=days.filter(d=>d<=todayStr());
 const habitScheduled=state.habits.habits.reduce((n,h)=>n+doneDays.filter(d=>(h.days||[]).includes(new Date(d+'T00:00:00').getDay())).length,0);
 const habitDone=state.habits.habits.reduce((n,h)=>n+doneDays.filter(d=>(h.days||[]).includes(new Date(d+'T00:00:00').getDay())&&state.habits.logs[d]&&state.habits.logs[d][h.id]).length,0);
 const sleepHours=sleep.map(e=>sleepDuration(e.bed,e.wake)).filter(Number.isFinite);
 const workoutDates=new Set(workoutLogs.filter(a=>Number(a.sets||0)>0).map(a=>a.date));
 const scheduledWorkout=doneDays.filter(d=>{const c=state.workout.schedule[new Date(d+'T00:00:00').getDay()];return c&&!/rest/i.test(c);});
 const prepLogs=[];doneDays.forEach(d=>(state.meals.preps||[]).filter(p=>p.start<=d&&d<=p.end).forEach(p=>{const l=state.meals.prepLogs[prepLogKey(d,p.id)],st=typeof l==='string'?l:l&&l.status;prepLogs.push(st==='yes');}));
 return {ym,r,
  money:{income:tx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0),expenses:tx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0)},
  trading:{trades:trades.length,pl:trades.reduce((s,t)=>s+tradePL(t),0),wins:trades.filter(t=>tradePL(t)>0).length},
  habits:{scheduled:habitScheduled,done:habitDone},
  running:{runs:run.length,distance:run.reduce((s,x)=>s+Number(x.distance||0),0)},
  workout:{logs:workoutLogs.length,dates:workoutDates.size,scheduled:scheduledWorkout.length,completed:scheduledWorkout.filter(d=>workoutDates.has(d)).length,sets:workoutLogs.reduce((s,a)=>s+Number(a.sets||0),0),reps:workoutLogs.reduce((s,a)=>s+Number(a.reps||0),0),weight:workoutLogs.reduce((s,a)=>s+Number(a.weight||0),0)},
  meals:{entries:meal.length,calories:meal.reduce((s,e)=>s+Number(e.cal||0),0),protein:meal.reduce((s,e)=>s+Number(e.protein||0),0),prep:prepLogs.filter(Boolean).length,prepMissed:prepLogs.filter(x=>!x).length},
  sleep:{entries:sleep.length,avg:sleepHours.length?sleepHours.reduce((a,b)=>a+b,0)/sleepHours.length:0},
  water:{entries:water.length,total:water.reduce((s,e)=>s+Number(e.amount||0),0)},
  calendar:{events:events.filter(e=>e.category==='Event').length,tasks:events.filter(e=>e.category==='Task').length,errands:events.filter(e=>e.category==='Errands').length,reminders:events.filter(e=>e.category==='Reminder').length},
  reading:{books:books.length},
  journal:{entries:journals.length,gratitude:gratitude.length},
  groceries:{items:groceries.length,spend:groceries.reduce((s,g)=>s+Number(g.price||g.amount||0),0)}
 };
}
function reportHtml(){
 const d=monthlyReportData(), moneyNet=d.money.income-d.money.expenses, row=(a,b,c='')=>'<div class="life-management-row"><span class="ev-title">'+a+'</span><span class="mono">'+b+'</span><span class="text-faint">'+c+'</span></div>';
 const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
 return '<div class="form-col"><div class="card" style="margin:0"><div class="card-title">Monthly Dashboard Report</div><div class="text-faint">'+fmtDateLong(d.r.start)+' → '+fmtDateLong(d.r.end)+'</div></div>'+ 
 '<div class="mini-chart-title">Money</div>'+row('Income',fmtMoney(d.money.income))+row('Expenses',fmtMoney(d.money.expenses))+row('Net',fmtMoney(moneyNet))+ 
 '<div class="mini-chart-title">Trading</div>'+row('Trades',d.trading.trades)+row('Trading P/L',fmtMoney(d.trading.pl))+row('Win rate',pct(d.trading.wins,d.trading.trades))+
 '<div class="mini-chart-title">Habits</div>'+row('Scheduled checks',d.habits.scheduled)+row('Completed checks',d.habits.done,pct(d.habits.done,d.habits.scheduled))+
 '<div class="mini-chart-title">Running</div>'+row('Runs',d.running.runs)+row('Distance',d.running.distance.toFixed(1)+' km')+
 '<div class="mini-chart-title">Workout</div>'+row('Workout log entries',d.workout.logs)+row('Scheduled days',d.workout.scheduled)+row('Completed days',d.workout.completed,pct(d.workout.completed,d.workout.scheduled))+row('Total sets',d.workout.sets)+row('Total reps',d.workout.reps)+row('Weight logged',d.workout.weight.toFixed(1))+
 '<div class="mini-chart-title">Meals</div>'+row('Meal entries',d.meals.entries)+row('Calories',d.meals.calories+' kcal')+row('Protein',d.meals.protein+' g')+row('Prepped meals eaten',d.meals.prep)+row('Prepped meals missed',d.meals.prepMissed)+
 '<div class="mini-chart-title">Sleep</div>'+row('Sleep logs',d.sleep.entries)+row('Average sleep',d.sleep.avg?d.sleep.avg.toFixed(1)+' hrs':'—')+
 '<div class="mini-chart-title">Water</div>'+row('Water logs',d.water.entries)+row('Total intake',d.water.total)+
 '<div class="mini-chart-title">Calendar</div>'+row('Events',d.calendar.events)+row('Tasks',d.calendar.tasks)+row('Errands',d.calendar.errands)+row('Reminders',d.calendar.reminders)+
 
 '<div class="mini-chart-title">Reading</div>'+row('Books finished',d.reading.books)+
 '<div class="mini-chart-title">Journal</div>'+row('Journal entries',d.journal.entries)+row('Gratitude entries',d.journal.gratitude)+
 '<div class="mini-chart-title">Groceries</div>'+row('Items logged',d.groceries.items)+row('Total spent',fmtMoney(d.groceries.spend))+'</div>';
}

async function openChangePasswordModal(){
  if(!supabaseUser||!supabaseClient){openAuthModal();return;}
  openModal('Change Password','<form id="modalForm" class="form-col">'+
    '<div class="text-faint">Enter your current password and choose a new one.</div>'+
    passwordEyeHtml('currentPassword','Current password','current-password')+
    passwordEyeHtml('newPassword','New password','new-password')+
    passwordEyeHtml('confirmPassword','Confirm new password','new-password')+
    '<div id="changePasswordStatus" class="auth-screen-status"></div>'+
    '<button class="btn btn-primary" type="submit">Change Password</button>'+
  '</form>');
  bindModalSubmit(async e=>{
    e.preventDefault();
    const f=e.target, status=document.getElementById('changePasswordStatus'), btn=f.querySelector('button[type="submit"]');
    if(f.newPassword.value.length<6){status.textContent='New password must be at least 6 characters.';return;}
    if(f.newPassword.value!==f.confirmPassword.value){status.textContent='New passwords do not match.';return;}
    btn.disabled=true; status.textContent='Updating password…';
    try{
      const email=supabaseUser.email;
      const verify=await supabaseClient.auth.signInWithPassword({email,password:f.currentPassword.value});
      if(verify.error) throw new Error('Current password is incorrect.');
      const res=await supabaseClient.auth.updateUser({password:f.newPassword.value});
      if(res.error) throw res.error;
      status.textContent='Password changed successfully.';
      setTimeout(closeModal,700);
    }catch(err){status.textContent=err.message||'Could not change password.';btn.disabled=false;}
  });
}

function openSettingsModal(){ const tabs=TABS.filter(t=>t.id!=='home').map(t=>'<option value="'+t.id+'" '+(appSettings.defaultTab===t.id?'selected':'')+'>'+t.label+'</option>').join(''); openModal('Settings','<form id="modalForm" class="form-col"><div class="mini-chart-title">General</div><div class="form-row"><label class="input">Default tab<select name="defaultTab" class="input"><option value="home" '+(appSettings.defaultTab==='home'?'selected':'')+'>Home</option>'+tabs+'</select></label><label class="input">Currency<select name="currency" class="input"><option value="PHP" '+(appSettings.currency==='PHP'?'selected':'')+'>PHP ₱</option><option value="USD" '+(appSettings.currency==='USD'?'selected':'')+'>USD $</option><option value="EUR" '+(appSettings.currency==='EUR'?'selected':'')+'>EUR €</option><option value="JPY" '+(appSettings.currency==='JPY'?'selected':'')+'>JPY ¥</option></select></label></div><div class="mini-chart-title">Security</div><div class="form-row"><button type="button" class="btn btn-ghost" onclick="openChangePasswordModal()">Change Password</button><div class="text-faint" style="display:flex;align-items:center">Update your Life Management account password.</div></div><div class="mini-chart-title">Reports</div><div class="form-row"><label class="input">Default period<select name="period" class="input"><option value="month" '+(reportPeriod==='month'?'selected':'')+'>Monthly</option><option value="quarter" '+(reportPeriod==='quarter'?'selected':'')+'>Quarterly</option><option value="year" '+(reportPeriod==='year'?'selected':'')+'>Yearly</option></select></label><div class="text-faint" style="display:flex;align-items:center">Monthly reports default to the current month.</div></div><div class="mini-chart-title">Safety</div><label class="input" style="display:flex;gap:8px;align-items:center"><input name="confirmDeletes" type="checkbox" '+(appSettings.confirmDeletes?'checked':'')+'/> Confirm before deleting records</label><div class="mini-chart-title">Backup &amp; Recovery</div><div class="form-row"><button type="button" class="btn btn-ghost" onclick="createBackupNow()">Create Backup</button><button type="button" class="btn btn-ghost" onclick="downloadBackup()">Download Backup</button><label class="btn btn-ghost" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer">Import Backup<input type="file" accept="application/json,.json" onchange="importBackup(event)" style="display:none"/></label><button type="button" class="btn btn-ghost" onclick="recoverLocalSnapshot()">Restore Last Safe Copy</button></div><div class="text-faint">Backups contain your Life Management data only — never your password, session token, or Supabase key. A safety copy is created before every restore/import.</div><button class="btn btn-primary" type="submit">Save Settings</button></form>'); bindModalSubmit(async e=>{e.preventDefault();const f=e.target;appSettings.defaultTab=f.defaultTab.value;appSettings.currency=f.currency.value;appSettings.confirmDeletes=f.confirmDeletes.checked;reportPeriod=f.period.value;reportMonth=todayStr().slice(0,7);try{localStorage.setItem('ledger_settings',JSON.stringify(appSettings));localStorage.setItem('ledger_report_period',reportPeriod);localStorage.setItem('ledger_report_month',reportMonth);}catch(err){}closeModal();renderShell();}); }
async function createBackupPayload(){
  return {version:7,schemaVersion:SYNC_SCHEMA_VERSION,exportedAt:new Date().toISOString(),revision:Number(localRevision)||0,state:cloneJson(state)};
}
async function createBackupNow(){
  try{
    const payload=await createBackupPayload();
    await window.storage.set('manual_backup',JSON.stringify(payload),false);
    syncStatus='Backup created'; updateAuthUI();
    openModal('Backup Created','<div class="form-col"><div class="sync-note"><strong>Backup saved on this device.</strong><br>'+esc(payload.exportedAt)+'</div><div class="text-faint">You can also download a copy as a JSON file for safekeeping.</div><div class="form-row"><button class="btn btn-primary" onclick="downloadBackup();closeModal()">Download Backup</button><button class="btn btn-ghost" onclick="closeModal()">Done</button></div></div>');
  }catch(e){ showSyncFailure(e,'Create backup'); }
}
async function downloadBackup(){
  const payload=await createBackupPayload();
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Life-Management-backup-'+todayStr()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
async function importBackup(ev){
  const file=ev.target.files&&ev.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data||!data.state||typeof data.state!=='object') throw new Error('Invalid backup');
      if(!confirm('Create a safety copy first, then import this backup?')) return;
      // IMPORTANT: protect the currently active data BEFORE replacing anything.
      await saveLocalSnapshot();
      await window.storage.set('pre_restore_backup',JSON.stringify(await createBackupPayload()),false);
      state=mergeDefaultsIntoState(data.state);
      localRevision=Math.max(Number(localRevision)||0,Number(data.revision)||0)+1;
      for(const k of Object.keys(defaults)) await window.storage.set(k,JSON.stringify(state[k]),false);
      await setSyncDirty(true);
      scheduleLocalSnapshot();
      syncStatus='Backup imported · not yet synced'; updateAuthUI();
      renderShell();
      alert('Backup imported successfully. Your previous data was saved as a safety copy first.');
    }catch(err){ alert('Could not import backup. Please choose a valid Life Management JSON backup.'); }
    finally{ try{ev.target.value='';}catch(e){} }
  };
  reader.readAsText(file);
}

function openReportsModal(){
  openModal('Download Report',
    '<div class="form-col">'+
      '<div class="text-faint">Monthly report · '+esc(reportMonth)+'</div>'+
      '<div id="reportPreview">'+reportHtml()+'</div>'+
      '<div style="height:1px;background:var(--line);margin:4px 0 2px"></div>'+
      '<button class="btn btn-primary" onclick="downloadReportJPEG()">Download This Report (JPEG)</button>'+ 
    '</div>'
  );
}
function loadHtml2Canvas(){ return new Promise((resolve,reject)=>{ if(window.html2canvas)return resolve(window.html2canvas); const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';sc.onload=()=>resolve(window.html2canvas);sc.onerror=reject;document.head.appendChild(sc); }); }
async function downloadReportJPEG(){
  try{
    const html2canvas=await loadHtml2Canvas();
    const report=document.getElementById('reportPreview');
    if(!report) throw new Error('Report preview not found');
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const canvas=await html2canvas(report,{
      backgroundColor:'#151719',
      scale:Math.min(1.5, window.devicePixelRatio || 1.5),
      useCORS:true,
      logging:false,
      scrollX:0,
      scrollY:0,
      width:report.scrollWidth,
      height:report.scrollHeight,
      windowWidth:Math.max(document.documentElement.clientWidth,report.scrollWidth),
      windowHeight:Math.max(document.documentElement.clientHeight,report.scrollHeight)
    });
    const link=document.createElement('a');
    link.download='Life-Management-Report-'+reportMonth+'.jpg';
    link.href=canvas.toDataURL('image/jpeg',0.94);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }catch(e){
    console.error(e);
    alert('Report JPEG export failed. Please try again after the report finishes loading.');
  }
}

/* ---------- MESSAGES / DIRECT CHAT + ATTACHMENTS ---------- */
let messagePartner=null;
let messageRows=[];
let messageChannel=null;
let messageListChannel=null;
let messageSearchTimer=null;
const CHAT_BUCKET='chat-attachments';
const CHAT_MAX_FILE_BYTES=25*1024*1024;

function chatNicknameKey(partnerId){ return 'ledger_chat_nickname_'+String(supabaseUser?.id||'anon')+'_'+String(partnerId||''); }
function getChatNickname(partner){
  if(!partner)return '';
  try{return localStorage.getItem(chatNicknameKey(partner.id))||'';}catch(e){return '';}
}
function chatDisplayName(partner){
  return getChatNickname(partner)||partner?.display_name||partner?.email||'Account';
}
function openChatNicknameModal(){
  if(!messagePartner)return;
  const current=getChatNickname(messagePartner);
  openModal('Chat Nickname','<form id="modalForm" class="form-col">'+
    '<div class="text-faint">This nickname is only visible to you.</div>'+
    '<input name="nickname" class="input" maxlength="60" placeholder="Nickname" value="'+esc(current)+'"/>'+
    '<button class="btn btn-primary" type="submit">Save Nickname</button>'+
  '</form>');
  bindModalSubmit(e=>{
    e.preventDefault();
    const value=e.target.nickname.value.trim();
    try{
      if(value)localStorage.setItem(chatNicknameKey(messagePartner.id),value);
      else localStorage.removeItem(chatNicknameKey(messagePartner.id));
    }catch(err){}
    closeModal(); renderMessages();
  });
}

function chatStatusHtml(text=''){ return '<div id="chatStatus" class="chat-status">'+esc(text)+'</div>'; }
function closeMessageRealtime(){ try{ if(messageChannel && supabaseClient) supabaseClient.removeChannel(messageChannel); }catch(e){} messageChannel=null; }
function closeMessageListRealtime(){ try{ if(messageListChannel && supabaseClient) supabaseClient.removeChannel(messageListChannel); }catch(e){} messageListChannel=null; }
async function ensureOwnProfile(){
  if(!supabaseClient||!supabaseUser) return;
  try{ await supabaseClient.from('profiles').upsert({id:supabaseUser.id,email:(supabaseUser.email||'').toLowerCase(),display_name:supabaseUser.user_metadata?.display_name||supabaseUser.email||'Account'},{onConflict:'id'}); }catch(e){ console.warn('[Life Management Messages] profile',e); }
}
async function searchChatAccounts(){
  const input=document.getElementById('chatSearch'); const box=document.getElementById('chatSearchResults');
  if(!input||!box||!supabaseClient||!supabaseUser)return;
  const q=input.value.trim().toLowerCase();
  if(q.length<2){box.innerHTML='';return;}
  box.innerHTML='<div class="chat-search-loading">Searching…</div>';
  const {data,error}=await supabaseClient.from('profiles').select('id,email,display_name').neq('id',supabaseUser.id).or('email.ilike.%'+q+'%,display_name.ilike.%'+q+'%').order('email',{ascending:true}).limit(12);
  if(error){box.innerHTML='<div class="chat-search-loading">Could not search accounts. Run the Messages SQL setup first.</div>';return;}
  box.innerHTML=data?.length?data.map(p=>'<button class="chat-user-result" onclick="openChatWith(\''+p.id+'\')"><span class="chat-avatar">'+esc((p.display_name||p.email||'?').slice(0,1).toUpperCase())+'</span><span><strong>'+esc(p.display_name||'Account')+'</strong><small>'+esc(p.email||'')+'</small></span></button>').join(''):'<div class="chat-search-loading">No other account found.</div>';
}
function scheduleChatSearch(){ clearTimeout(messageSearchTimer); messageSearchTimer=setTimeout(searchChatAccounts,220); }

async function loadConversationList(){
  if(!supabaseClient||!supabaseUser)return [];
  const uid=supabaseUser.id;
  const {data:rows,error}=await supabaseClient.from('direct_messages')
    .select('id,sender_id,receiver_id,body,created_at,read_at,attachment_name,attachment_type,attachment_size')
    .or('sender_id.eq.'+uid+',receiver_id.eq.'+uid)
    .order('created_at',{ascending:false}).limit(500);
  if(error){ console.warn('[Life Management Messages] conversation list',error); return {error}; }
  const byPartner=new Map();
  (rows||[]).forEach(m=>{
    const pid=m.sender_id===uid?m.receiver_id:m.sender_id;
    if(!byPartner.has(pid)) byPartner.set(pid,{last:m,unread:0});
    if(m.receiver_id===uid && !m.read_at) byPartner.get(pid).unread++;
  });
  const ids=[...byPartner.keys()];
  if(!ids.length)return [];
  const {data:profiles,error:profileError}=await supabaseClient.from('profiles').select('id,email,display_name').in('id',ids);
  if(profileError) return {error:profileError};
  const profileMap=new Map((profiles||[]).map(p=>[p.id,p]));
  return ids.map(id=>({...profileMap.get(id),...byPartner.get(id)})).filter(x=>x.email);
}
function chatConversationRowHtml(c){
  const name=esc(chatDisplayName(c));
  const preview=c.last?.body?esc(c.last.body):((c.last?.attachment_type||'').startsWith('image/')?'📷 Photo':('📎 '+esc(c.last?.attachment_name||'File')));
  const time=c.last?.created_at?new Date(c.last.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  return '<button class="chat-conversation-row" onclick="openChatWith(\''+c.id+'\')"><span class="chat-avatar">'+esc((c.display_name||c.email||'?').slice(0,1).toUpperCase())+'</span><span class="chat-conversation-main"><strong>'+name+'</strong><small>'+esc(c.email||'')+'</small><span class="chat-conversation-preview">'+preview+'</span></span><span class="chat-conversation-meta"><small>'+esc(time)+'</small>'+(c.unread?'<b class="chat-unread-badge">'+c.unread+'</b>':'')+'</span></button>';
}
async function refreshConversationList(){
  const box=document.getElementById('chatConversationList'); if(!box)return;
  const result=await loadConversationList();
  if(result?.error){box.innerHTML='<div class="chat-search-loading">Could not load conversations. Please check the Messages SQL setup.</div>';return;}
  box.innerHTML=result.length?result.map(chatConversationRowHtml).join(''):'<div class="empty">No conversations yet. Search an account above to start chatting.</div>';
}
function subscribeMessageList(){
  closeMessageListRealtime();
  if(!supabaseClient||!supabaseUser)return;
  const uid=supabaseUser.id;
  messageListChannel=supabaseClient.channel('messages-inbox-'+uid).on('postgres_changes',{event:'*',schema:'public',table:'direct_messages'},payload=>{
    const m=payload.new||payload.old;
    if(!m || (m.sender_id!==uid && m.receiver_id!==uid))return;
    if(currentTab==='messages' && !messagePartner) refreshConversationList();
  }).subscribe();
}
async function openChatWith(userId){
  if(!supabaseClient||!supabaseUser)return;
  closeMessageListRealtime();
  const {data,error}=await supabaseClient.from('profiles').select('id,email,display_name').eq('id',userId).maybeSingle();
  if(error||!data){openModal('Messages','<div class="form-col"><div class="sync-note">Could not open this account.</div><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>');return;}
  messagePartner=data;
  await loadChatMessages();
  renderMessages();
}
async function hydrateChatAttachmentUrls(rows){
  if(!supabaseClient) return rows;
  return await Promise.all((rows||[]).map(async m=>{
    if(!m.attachment_path) return m;
    try{
      const {data,error}=await supabaseClient.storage.from(CHAT_BUCKET).createSignedUrl(m.attachment_path,60*60);
      if(!error&&data?.signedUrl) return {...m,attachment_url:data.signedUrl};
    }catch(e){}
    return {...m,attachment_url:null};
  }));
}
async function loadChatMessages(){
  if(!supabaseClient||!supabaseUser||!messagePartner)return;
  const uid=supabaseUser.id, pid=messagePartner.id;
  const {data,error}=await supabaseClient.from('direct_messages').select('id,sender_id,receiver_id,body,created_at,read_at,attachment_path,attachment_name,attachment_type,attachment_size').or('and(sender_id.eq.'+uid+',receiver_id.eq.'+pid+'),and(sender_id.eq.'+pid+',receiver_id.eq.'+uid+')').order('created_at',{ascending:true}).limit(300);
  if(error){ messageRows=[]; const st=document.getElementById('chatStatus'); if(st) st.textContent='Chat setup incomplete. Run the Messages SQL setup.'; return; }
  messageRows=await hydrateChatAttachmentUrls(data||[]);
  await markChatRead();
  subscribeChat();
}
async function markChatRead(){
  if(!supabaseClient||!supabaseUser||!messagePartner)return;
  await supabaseClient.from('direct_messages').update({read_at:new Date().toISOString()}).eq('sender_id',messagePartner.id).eq('receiver_id',supabaseUser.id).is('read_at',null);
}
async function addAttachmentUrl(m){
  if(!m?.attachment_path||!supabaseClient)return m;
  try{ const {data,error}=await supabaseClient.storage.from(CHAT_BUCKET).createSignedUrl(m.attachment_path,60*60); if(!error&&data?.signedUrl)return {...m,attachment_url:data.signedUrl}; }catch(e){}
  return m;
}
function subscribeChat(){
  closeMessageRealtime();
  if(!supabaseClient||!supabaseUser||!messagePartner)return;
  messageChannel=supabaseClient.channel('direct-chat-'+supabaseUser.id+'-'+messagePartner.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages'},async payload=>{
    const m=payload.new; const relevant=(m.sender_id===supabaseUser.id&&m.receiver_id===messagePartner.id)||(m.sender_id===messagePartner.id&&m.receiver_id===supabaseUser.id);
    if(!relevant)return;
    const hydrated=await addAttachmentUrl(m);
    if(!messageRows.some(x=>x.id===m.id)) messageRows.push(hydrated);
    if(m.sender_id===messagePartner.id){ markChatRead(); }
    renderMessages();
    if(m.sender_id===messagePartner.id && document.hidden) showPhoneNotification('New message from '+(chatDisplayName(messagePartner)),m.body||('Sent '+(m.attachment_type?.startsWith('image/')?'a photo':'a file')),'chat-'+m.id);
  }).subscribe();
}
function formatFileSize(bytes){ const n=Number(bytes||0); if(n<1024)return n+' B'; if(n<1024*1024)return Math.round(n/1024)+' KB'; if(n<1024*1024*1024)return (n/1024/1024).toFixed(1)+' MB'; return (n/1024/1024/1024).toFixed(1)+' GB'; }
function chatAttachmentHtml(m){
  if(!m.attachment_path)return '';
  if(!m.attachment_url) return '<div class="chat-attachment chat-attachment-missing">Attachment unavailable</div>';
  const name=esc(m.attachment_name||'Attachment');
  if((m.attachment_type||'').startsWith('image/')) return '<a class="chat-image-attachment" href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener"><img src="'+esc(m.attachment_url)+'" alt="'+name+'" loading="lazy"/><span>'+name+'</span></a>';
  return '<a class="chat-file-attachment" href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener"><span class="chat-file-icon">📎</span><span class="chat-file-meta"><strong>'+name+'</strong><small>'+esc(m.attachment_type||'File')+' · '+formatFileSize(m.attachment_size)+'</small></span><span>↗</span></a>';
}
function chatRowHtml(m){
  const mine=m.sender_id===supabaseUser?.id;
  const body=m.body?'<div class="chat-bubble '+(mine?'mine':'theirs')+'">'+esc(m.body)+'</div>':'';
  return '<div class="chat-bubble-wrap '+(mine?'mine':'theirs')+'">'+body+chatAttachmentHtml(m)+'<div class="chat-time">'+new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</div></div>';
}
function renderMessages(){
  if(messagePartner){
    closeMessageListRealtime();
    closeMessageRealtime();
  }
  const main=document.getElementById('main'); if(!main)return;
  const partner=messagePartner;
  const conversation=partner
    ? '<div class="chat-header"><button class="btn btn-ghost" onclick="clearChatPartner();" aria-label="Back">←</button><div class="chat-header-person"><div class="card-title">'+esc(chatDisplayName(partner))+'</div><div class="text-faint">'+esc(partner.email||'')+'</div></div><button class="btn btn-ghost chat-nickname-btn" type="button" onclick="openChatNicknameModal()" aria-label="Change nickname">✎</button></div><div id="chatThread" class="chat-thread">'+(messageRows.length?messageRows.map(chatRowHtml).join(''):'<div class="empty">No messages yet. Say hi.</div>')+'</div><form id="chatSendForm" class="chat-compose"><label class="chat-attach-btn" title="Attach file" aria-label="Attach file">📎<input id="chatFileInput" type="file" /></label><div class="chat-input-wrap"><textarea id="chatMessageInput" class="input" rows="1" maxlength="2000" placeholder="Message…"></textarea><span id="chatSelectedFile" class="chat-selected-file"></span></div><button class="chat-send-btn" type="submit" aria-label="Send message" title="Send">➤</button></form>'+chatStatusHtml('Photos and files up to 25 MB.') 
    : '<div class="card"><div class="card-head-row"><div><div class="card-title">Messages</div><div class="text-faint">Chat your life management partner</div></div></div><div class="chat-search"><input id="chatSearch" class="input" type="email" placeholder="Search another account by email…" oninput="scheduleChatSearch()"/><div id="chatSearchResults" class="chat-search-results"></div></div><div class="chat-inbox-title">Recent conversations</div><div id="chatConversationList" class="chat-conversation-list"><div class="chat-search-loading">Loading conversations…</div></div>'+chatStatusHtml('')+'</div>';
  main.innerHTML='<div class="today-hero"><div class="hero-eyebrow">LIFE</div><div class="hero-date">Messages</div><div class="hero-rule"></div></div>'+conversation;
  if(partner){
    const f=document.getElementById('chatSendForm'); f?.addEventListener('submit',sendChatMessage);
    const fileInput=document.getElementById('chatFileInput'); fileInput?.addEventListener('click',e=>e.stopPropagation()); fileInput?.addEventListener('change',e=>{e.stopPropagation();const file=fileInput.files?.[0];const el=document.getElementById('chatSelectedFile');if(el)el.textContent=file?file.name:'';});
    const thread=document.getElementById('chatThread'); if(thread) thread.scrollTop=thread.scrollHeight;
    document.getElementById('chatMessageInput')?.focus();
    subscribeChat();
  }else{
    refreshConversationList();
    subscribeMessageList();
  }
}
function clearChatPartner(){ messagePartner=null; messageRows=[]; closeMessageRealtime(); renderMessages(); }
async function sendChatMessage(e){
  e.preventDefault();
  const input=document.getElementById('chatMessageInput'); const fileInput=document.getElementById('chatFileInput'); const body=input?.value.trim()||''; const file=fileInput?.files?.[0]||null;
  if(!body&&!file||!messagePartner||!supabaseClient||!supabaseUser)return;
  if(file && file.size>CHAT_MAX_FILE_BYTES){ const st=document.getElementById('chatStatus'); if(st)st.textContent='File is too large. Maximum size is 25 MB.'; return; }
  const btn=e.submitter; if(btn)btn.disabled=true;
  let messageId=null;
  try{
    const {data,error}=await supabaseClient.from('direct_messages').insert({sender_id:supabaseUser.id,receiver_id:messagePartner.id,body:body.slice(0,2000)}).select('id,sender_id,receiver_id,body,created_at,read_at,attachment_path,attachment_name,attachment_type,attachment_size').single();
    if(error)throw error;
    messageId=data.id;
    let row=data;
    if(file){
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-160)||'attachment';
      const path=messageId+'/'+safeName;
      const up=await supabaseClient.storage.from(CHAT_BUCKET).upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
      if(up.error)throw up.error;
      const {data:updated,error:updateError}=await supabaseClient.from('direct_messages').update({attachment_path:path,attachment_name:file.name,attachment_type:file.type||'application/octet-stream',attachment_size:file.size}).eq('id',messageId).select('id,sender_id,receiver_id,body,created_at,read_at,attachment_path,attachment_name,attachment_type,attachment_size').single();
      if(updateError)throw updateError;
      row=updated;
    }
    row=await addAttachmentUrl(row);
    if(!messageRows.some(x=>x.id===row.id))messageRows.push(row);
    input.value=''; if(fileInput)fileInput.value=''; const selected=document.getElementById('chatSelectedFile');if(selected)selected.textContent=''; renderMessages();
  }catch(err){
    if(messageId){ try{await supabaseClient.storage.from(CHAT_BUCKET).remove([messageId+'/'+(file?.name||'')]);}catch(e){} try{await supabaseClient.from('direct_messages').delete().eq('id',messageId);}catch(e){} }
    const st=document.getElementById('chatStatus'); if(st)st.textContent=err.message||'Could not send message.';
  }finally{ if(btn)btn.disabled=false; }
}
async function renderMessagesAsync(){ await ensureOwnProfile(); renderMessages(); }

/* ---------- SUPABASE AUTH + OFFLINE SYNC ---------- */
/* ---------- SUPABASE AUTH + OFFLINE SYNC ---------- */
const SUPABASE_URL='https://pmngfcbqtlyhzuatkvut.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_-F1xb_cmNaLXPCJ8B5uybg_R42BLrfy';
let supabaseClient=null;
let supabaseUser=null;
let syncTimer=null;
let syncMonitorTimer=null;
let syncBusy=false;
let syncStatus='Not signed in';
let syncConflictPending=false;
const SYNC_SCHEMA_VERSION=4;
const LOCAL_SNAPSHOT_KEY='__ledger_local_snapshot_v2';
const LOCAL_SYNC_META_KEY='__ledger_sync_meta_v3';
const LOCAL_SYNC_DIRTY_KEY='__ledger_sync_dirty_v1';
let snapshotTimer=null;
let localRevision=0;
let accountInitBusy=false;
let authRecoveryInProgress=false;
const AUTH_RECOVERY_REDIRECT=(window.location.origin + window.location.pathname).replace(/\/+$/,'/') ;
function supabaseReady(){ return !!(window.supabase && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY); }
function initSupabase(){
  if(!supabaseReady()) return;
  authRecoveryInProgress = /(?:[?&]type=recovery\b)|(?:#.*(?:^|&)type=recovery(?:&|$))|(?:[?&]code=)/i.test(window.location.search + window.location.hash);
  supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){ authRecoveryInProgress=true; supabaseUser=session?.user||null; syncStatus='Password recovery'; updateAuthUI(); renderAuthScreen('recovery'); return; }
    supabaseUser=session?.user||null;
    syncStatus=supabaseUser?(navigator.onLine?'Signed in · synced':'Signed in · offline'):'Not signed in';
    updateAuthUI();
    if(event==='SIGNED_IN' && supabaseUser) setTimeout(()=>enterAuthenticatedApp(),0);
    if(event==='SIGNED_OUT'){ syncStatus='Not signed in'; updateAuthUI(); renderAuthScreen('signin'); }
  });
}

function passwordEyeHtml(name,placeholder,autocomplete='current-password'){
  return '<div class="password-field"><input name="'+name+'" id="'+name+'" type="password" autocomplete="'+autocomplete+'" minlength="6" required placeholder="'+placeholder+'" class="input"><button type="button" class="password-eye" aria-label="Show password" onclick="togglePasswordVisibility(\''+name+'\',this)">👁</button></div>';
}
function togglePasswordVisibility(id,btn){
  const input=document.getElementById(id); if(!input)return;
  const showing=input.type==='text';
  input.type=showing?'password':'text';
  if(btn){btn.textContent=showing?'◉':'◉';btn.classList.toggle('is-visible',!showing);btn.setAttribute('aria-label',showing?'Show password':'Hide password');}
}

function renderAuthScreen(mode='signin', message=''){
  const isSignup=mode==='signup';
  const isReset=mode==='reset';
  const isRecovery=mode==='recovery';
  if(isRecovery){
    appRoot.innerHTML='<div class="auth-screen"><div class="auth-screen-card">'+
      '<div class="auth-screen-brand"><span class="brand-mark"><img src="./assets/icons/icon-192.png" alt="Life Management"></span><div><div class="auth-screen-title">Life Management</div><div class="auth-screen-sub">plan it. track it. live it.</div></div></div>'+
      '<form id="authScreenForm" class="form-col">'+
      '<div style="font-weight:600;font-size:18px;margin-bottom:2px">Set a new password</div>'+
      '<div class="text-faint" style="margin-bottom:8px">Choose a new password for your Life Management account.</div>'+
      passwordEyeHtml('password','New password','new-password')+
      passwordEyeHtml('confirmPassword','Confirm new password','new-password')+
      '<div class="auth-screen-actions"><button class="btn btn-primary" type="submit">Update Password</button></div>'+
      '<div class="auth-screen-status" id="authScreenStatus">'+esc(message||'')+'</div>'+
      '</form></div></div>';
    const form=document.getElementById('authScreenForm');
    form?.addEventListener('submit',async e=>{
      e.preventDefault(); const status=document.getElementById('authScreenStatus'), submit=form.querySelector('button[type="submit"]');
      if(form.password.value!==form.confirmPassword.value){ status.textContent='Passwords do not match.'; return; }
      submit.disabled=true; status.textContent='Updating password…';
      try{
        const res=await supabaseClient.auth.updateUser({password:form.password.value});
        if(res.error) throw res.error;
        try{localStorage.setItem('ledger_password_recently_reset','1');}catch(e){}
        status.textContent='Password updated. Please sign in with your new password.';
        setTimeout(()=>{ try{supabaseClient.auth.signOut();}catch(e){} renderAuthScreen('signin','Password changed. Sign in with your new password.'); },900);
      }catch(err){ status.textContent=err.message||'Could not update password.'; submit.disabled=false; }
    });
    return;
  }
  appRoot.innerHTML='<div class="auth-screen"><div class="auth-screen-card">'+
    '<div class="auth-screen-brand"><span class="brand-mark"><img src="./assets/icons/icon-192.png" alt="Life Management"></span><div><div class="auth-screen-title">Life Management</div><div class="auth-screen-sub">Everything, in one place</div></div></div>'+
    '<form id="authScreenForm" class="form-col">'+
      '<div style="font-weight:600;font-size:18px;margin-bottom:2px">'+(isSignup?'Create your account':isReset?'Reset your password':'Welcome back')+'</div>'+
      '<div class="text-faint" style="margin-bottom:8px">'+(isSignup?'Create a private Life Management account to sync across your devices.':isReset?'Enter your email and we will send a password reset link.':'Sign in to access your Life Management.')+'</div>'+
      '<input name="email" type="email" autocomplete="email" required placeholder="Email" class="input">'+
      (isReset?'':passwordEyeHtml('password','Password','current-password'))+
      '<div class="auth-screen-actions"><button class="btn btn-primary" type="submit">'+(isSignup?'Create Account':isReset?'Send Reset Link':'Sign In')+'</button>'+
      (isReset?'<button class="auth-screen-link" type="button" id="authModeToggle">Back to sign in</button>':'<button class="auth-screen-link" type="button" id="authModeToggle">'+(isSignup?'Already have an account? Sign in':'Need an account? Create one')+'</button>')+
      (!isSignup&&!isReset?'<button class="auth-screen-link" type="button" id="forgotPasswordBtn">Forgot password?</button>':'')+
      '</div>'+
      '<div class="auth-screen-status" id="authScreenStatus">'+esc(message||'')+'</div>'+
    '</form>'+
    '<div class="auth-screen-offline">Your Life Management data is stored locally for offline use. An internet connection is needed only for account authentication and cloud sync.</div>'+
  '</div></div>';
  const form=document.getElementById('authScreenForm'); const toggle=document.getElementById('authModeToggle'); const forgot=document.getElementById('forgotPasswordBtn');
  toggle?.addEventListener('click',()=>renderAuthScreen(isReset?'signin':isSignup?'signin':'signup'));
  forgot?.addEventListener('click',()=>renderAuthScreen('reset'));
  form?.addEventListener('submit',async e=>{
    e.preventDefault(); const status=document.getElementById('authScreenStatus'), submit=form.querySelector('button[type="submit"]');
    submit.disabled=true; status.textContent=isReset?'Sending reset link…':isSignup?'Creating account…':'Signing in…';
    try{
      if(!supabaseClient) throw new Error('Supabase is not available. Check your connection and reload.');
      const email=form.email.value.trim();
      if(isReset){ const res=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:AUTH_RECOVERY_REDIRECT}); if(res.error) throw res.error; status.textContent='Password reset link sent. Check your email, then open the link to choose a new password.'; submit.disabled=false; return; }
      const password=form.password.value; const res=isSignup?await supabaseClient.auth.signUp({email,password}):await supabaseClient.auth.signInWithPassword({email,password});
      if(res.error) throw res.error;
      if(isSignup&&!res.data.session){ status.textContent='Account created. Check your email for the confirmation link, then sign in.'; submit.disabled=false; return; }
      await enterAuthenticatedApp();
    }catch(err){ status.textContent=err.message||'Authentication failed.'; submit.disabled=false; }
  });
}
async function legacyStorageHasData(){
  // Legacy unscoped data is intentionally never loaded into an account-scoped
  // session. It may belong to a different account, so keep it isolated.
  return false;
}
async function ensureAccountScopedStorage(){
  const uid=supabaseUser?.id;
  if(!uid) return;
  // Account isolation is silent during normal use. The active Supabase user ID
  // is bound BEFORE loadAll(), so every Life Management key is automatically namespaced.
  // Legacy pre-account-scoping data is never implicitly imported into an account.
  const markerKey='__ledger_account_scope_v1';
  const marker=await window.storage.get(markerKey,false);
  if(marker?.value!==uid) await window.storage.set(markerKey,uid,false);
  window.__ledgerAccountScopePending=false;
}
async function finishAccountScope(importLegacy){
  // Kept only for compatibility with older UI references. New builds do not
  // show an account-data migration prompt. Importing legacy data is disabled
  // here because its account ownership cannot be determined safely.
  const uid=supabaseUser?.id; if(!uid) return;
  await window.storage.set('__ledger_account_scope_v1',uid,false);
  window.__ledgerAccountScopePending=false;
  await loadAll();
  renderShell();
  if(navigator.onLine) setTimeout(()=>handleSignedIn(),0);
}


function maybePromptPasswordChangeAfterReset(){
  try{
    if(localStorage.getItem('ledger_password_recently_reset')!=='1') return;
    localStorage.removeItem('ledger_password_recently_reset');
  }catch(e){return;}
  setTimeout(()=>openChangePasswordModal(),350);
}

async function enterAuthenticatedApp(){
  if(!supabaseUser || accountInitBusy) return;
  await ensureOwnProfile();
  accountInitBusy=true;
  try{
    // Bind local storage to the authenticated Supabase user BEFORE loading any
    // Life Management state. This is the key account-isolation boundary.
    window.__ledgerStorageUserId = supabaseUser.id;
    await ensureAccountScopedStorage();
    window.__ledgerAccountScopePending=false;
    await loadAll();
    try{ const rp=localStorage.getItem('ledger_report_period'); if(rp&&['month','quarter','year'].includes(rp)) reportPeriod=rp; reportMonth=todayStr().slice(0,7); const st=JSON.parse(localStorage.getItem('ledger_settings')||'null'); if(st&&typeof st==='object') Object.assign(appSettings,st); }catch(e){}
    restoreCurrentTab(); if(currentTab==='sleep'||currentTab==='water') currentTab='sleepwater'; persistCurrentTab();
    renderShell();
    maybePromptPasswordChangeAfterReset();
    window.initLifeNotifications?.();
    if(navigator.onLine) setTimeout(()=>handleSignedIn(),0);
  }catch(err){ console.error(err); appRoot.innerHTML='<div class="loading">Something went wrong loading your data. Try reloading.</div>'; }
  finally{ accountInitBusy=false; }
}


function confirmLogout(){
  openModal('Log out',`
    <div style="max-width:420px;margin:0 auto;text-align:center">
      <div style="font-size:30px;margin-bottom:10px">⎋</div>
      <h3 style="margin:0 0 8px">Do you want to log out?</h3>
      <p style="color:var(--text-dim);margin:0 0 18px">Your local data will stay on this device.</p>
      <div style="display:flex;justify-content:center;gap:8px">
        <button class="btn btn-ghost" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" type="button" onclick="closeModal();signOutLedger()">Log out</button>
      </div>
    </div>
  `);
}

function openAccountPanel(){
  if(!supabaseUser){
    openAuthModal();
    return;
  }
  const email=esc(supabaseUser.email||'Signed in');
  const online=navigator.onLine;
  const status=esc(syncStatus||'No sync status yet');

  openModal('Account',`
    <div class="account-panel">
      <div class="account-summary">
        <div style="min-width:0">
          <div class="account-section-title">Account</div>
          <div class="account-email"><strong>${email}</strong></div>
        </div>
        <span class="badge ${online?'badge-done':'badge-pending'}">${online?'Online':'Offline'}</span>
      </div>

      <div class="account-section-title">Sync</div>
      <div class="account-actions">
        <button class="btn btn-primary" type="button" onclick="syncNow()">Sync</button>
        <button class="btn btn-ghost" type="button" onclick="showSyncDetails()">Details</button>
        <button class="btn btn-ghost" type="button" onclick="recoverLocalSnapshot()">Recover Local</button>
      </div>
      <div class="auth-status">${status}</div>

      <div class="account-section-title">App</div>
      <div class="account-actions">
        <button class="btn btn-ghost" type="button" onclick="closeModal();openSettingsModal()">Settings</button>
        <button class="btn btn-ghost" type="button" onclick="closeModal();enableHomeNotifications()">Enable Phone Notifications</button><button class="btn btn-ghost" type="button" onclick="closeModal();openReportsModal()">Download Reports</button>
      </div>

      <div class="account-logout-wrap">
        <button class="btn btn-ghost account-logout-btn" type="button" onclick="confirmLogout()">⎋ &nbsp; Log out</button>
        <p class="account-logout-note">Your local Life Management data will stay on this device.</p>
      </div>
    </div>
  `);

  document.querySelector('.modal-box')?.classList.add('account-modal-box');
}
function authButtonHtml(){
  if(supabaseUser){
    const conflictHtml='';
    return '<div class="auth-user"><span class="sync-dot '+(navigator.onLine?'online':'offline')+'"></span><span class="email" title="'+esc(supabaseUser.email||'Signed in')+'">'+esc(supabaseUser.email||'Signed in')+'</span></div>'+      '<div class="auth-actions"><button class="btn btn-ghost" onclick="syncNow()">Sync</button><button class="btn btn-ghost" onclick="showSyncDetails()">Details</button><button class="btn btn-ghost" onclick="recoverLocalSnapshot()">Recover Local</button><button class="btn btn-ghost" onclick="signOutLedger()">Sign out</button></div><div class="auth-status" id="authStatus">'+esc(syncStatus)+'</div>'+conflictHtml;
  }
  return '<button class="btn btn-ghost" onclick="openAuthModal()">Sign in / Create account</button><div class="auth-status" id="authStatus">'+esc(syncStatus)+'</div>';
}
function updateAuthUI(){
  const st=document.getElementById('authStatus'); if(st) st.textContent=syncStatus;
}
function showSyncDetails(){
  const stage=window.__ledgerSyncStage||'No sync has run yet.';
  const detail=window.__ledgerSyncDetail||'No additional details.';
  openModal('Sync Details','<div class="form-col"><div class="sync-note"><strong>Status:</strong> '+esc(syncStatus)+'</div><div class="sync-note"><strong>Stage:</strong> '+esc(stage)+'</div><div class="sync-note"><strong>Details:</strong><br>'+esc(detail)+'</div><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>');
}
async function recoverLocalSnapshot(){
  try{
    const snap=await readLocalSnapshot();
    if(!snap?.state || !Object.keys(snap.state).length){
      openModal('Local Recovery','<div class="form-col"><div class="sync-note">No local safety snapshot is available.</div><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>');
      return;
    }
    openModal('Recover Local Snapshot','<div class="form-col"><div class="sync-note"><strong>Safety snapshot found.</strong><br>Saved: '+esc(snap.savedAt||'unknown')+'<br>Revision: '+esc(String(snap.revision||0))+'</div><div class="sync-note">This will restore the local Life Management snapshot and will NOT upload or download anything.</div><div class="form-row"><button class="btn btn-primary" onclick="confirmRecoverLocalSnapshot()">Restore Snapshot</button><button class="btn btn-ghost" onclick="closeModal()">Cancel</button></div></div>');
  }catch(e){ openModal('Local Recovery','<div class="form-col"><div class="sync-note">Could not read the local safety snapshot.</div><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>'); }
}
async function confirmRecoverLocalSnapshot(){
  try{
    const snap=await readLocalSnapshot();
    if(!snap?.state) throw new Error('No valid local snapshot found.');
    state=mergeDefaultsIntoState(snap.state);
    localRevision=Math.max(localRevision,Number(snap.revision)||0);
    for(const k of Object.keys(defaults)) await window.storage.set(k,JSON.stringify(state[k]),false);
    await setSyncDirty(true);
    scheduleLocalSnapshot();
    closeModal(); renderShell();
    syncStatus='Local snapshot restored · not synced';
    syncLog('Local snapshot restored','Cloud was not changed');
    updateAuthUI();
  }catch(e){ showSyncFailure(e,'Local recovery'); }
}
function openAuthModal(){
  if(!supabaseClient){ alert('Supabase is not available. Check your internet connection and reload.'); return; }
  openModal('Life Management Account','<div class="auth-card"><form id="modalForm" class="form-col"><div class="text-faint">Your Life Management stays available offline. Sign in to back it up and sync across devices.</div><label class="input">Email<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label class="input">Password<input name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters"></label><div class="form-row"><button class="btn btn-primary" type="submit" name="action" value="signin">Sign in</button><button class="btn btn-ghost" type="submit" name="action" value="signup">Create account</button></div><button class="auth-screen-link" type="button" id="authModalForgot">Forgot password?</button><div class="auth-status" id="authModalStatus"></div></form></div>');
  const f=document.getElementById('modalForm');
  document.getElementById('authModalForgot')?.addEventListener('click',async()=>{ const email=f.email.value.trim(), out=document.getElementById('authModalStatus'); if(!email){out.textContent='Enter your email first.';f.email.focus();return;} out.textContent='Sending reset link…'; try{const res=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:AUTH_RECOVERY_REDIRECT}); if(res.error) throw res.error; out.textContent='Reset link sent. Check your email.';}catch(err){out.textContent=err.message||'Could not send reset link.';} });
  f.addEventListener('submit',async e=>{e.preventDefault(); const btn=e.submitter; const email=f.email.value.trim(); const password=f.password.value; const out=document.getElementById('authModalStatus'); out.textContent='Working…'; try{ let res; if(btn?.value==='signup') res=await supabaseClient.auth.signUp({email,password}); else res=await supabaseClient.auth.signInWithPassword({email,password}); if(res.error) throw res.error; if(btn?.value==='signup' && !res.data.session) out.textContent='Account created. Check your email if confirmation is required, then sign in.'; else { closeModal(); } }catch(err){ out.textContent=err.message||'Authentication failed.'; } });
}
async function signOutLedger(){
  if(!supabaseClient)return;
  clearTimeout(syncTimer);
  if(syncMonitorTimer){ clearInterval(syncMonitorTimer); syncMonitorTimer=null; }
  window.__ledgerStorageUserId=null;
  window.__ledgerAccountScopePending=false;
  window.destroyLifeNotifications?.();
  supabaseUser=null;
  state={};
  localRevision=0;
  syncStatus='Signing out…'; updateAuthUI();
  await supabaseClient.auth.signOut();
  updateAuthUI();
}
function localStateHasData(){
  return Object.keys(defaults).some(k=>{
    const a=state[k], b=defaults[k];
    return JSON.stringify(a)!==JSON.stringify(b);
  });
}

// A fresh PWA/account-scoped store can contain migration-only differences
// (for example workout._plansMigrated) even though the user has no actual
// Life Management records on this origin. Treat those as empty so first launch can
// safely hydrate from the authenticated user's cloud row instead of merging
// empty defaults over real cloud data.
function localStateHasMeaningfulData(){
  const m=state?.money||{};
  if((m.accounts||[]).length || (m.transactions||[]).length || (m.budgets||[]).length || (m.bills||[]).length || (m.noSpendDays||[]).length || (m.noSpendRules||[]).length) return true;
  if((state?.trading?.trades||[]).length) return true;
  if((state?.habits?.habits||[]).length || Object.keys(state?.habits?.logs||{}).length) return true;
  if((state?.running?.runs||[]).length) return true;
  const w=state?.workout||{};
  if((w.sessions||[]).length || (w.exerciseLogs||[]).length || (w.exercisePlans||[]).length || Object.keys(w.schedule||{}).length) return true;
  if((state?.meals?.entries||[]).length || (state?.meals?.preps||[]).length || Object.keys(state?.meals?.prepLogs||{}).length) return true;
  if((state?.sleep?.entries||[]).length) return true;
  if((state?.water?.entries||[]).length) return true;
  if((state?.calendar?.events||[]).length || (state?.calendar?.reminders||[]).length) return true;
  if((state?.reading?.books||[]).length) return true;
  if((state?.journal?.entries||[]).length || (state?.journal?.gratitude||[]).length) return true;
  if((state?.groceries?.items||[]).length) return true;
  // Preserve intentional goal/settings changes as meaningful local data.
  if(Number(state?.meals?.goal?.cal)!==Number(defaults.meals.goal.cal) || Number(state?.meals?.goal?.protein)!==Number(defaults.meals.goal.protein)) return true;
  if(Number(state?.sleep?.goalHours)!==Number(defaults.sleep.goalHours)) return true;
  if(Number(state?.water?.goal)!==Number(defaults.water.goal)) return true;
  return false;
}
function cloudStateHasMeaningfulData(normalized){
  if(!normalized?.state) return false;
  const saved=state;
  try{ state=normalized.state; return localStateHasMeaningfulData(); }
  finally{ state=saved; }
}
function cloudUploadMustBeBlocked(currentRow, localMeta){
  if(!currentRow) return null;
  const current=normalizeCloudData(currentRow.data);
  if(!current?.state) return 'The existing cloud Life Management is invalid. Upload was blocked for safety.';
  const localMeaningful=localStateHasMeaningfulData();
  const cloudMeaningful=cloudStateHasMeaningfulData(current);
  if(!localMeaningful && cloudMeaningful){
    return 'Upload blocked: this device has no meaningful Life Management data, but the cloud contains Life Management data. Cloud data was not overwritten.';
  }
  if(!localMeta?.fingerprint){
    return 'Upload blocked: this device has no verified sync baseline for the existing cloud Life Management.';
  }
  const currentFp=stateFingerprint(current.state);
  if(currentFp!==String(localMeta.fingerprint)){
    return 'Upload blocked: the cloud changed since this device last synced. The cloud copy was not overwritten.';
  }
  return null;
}
function categorySummary(obj){
  return Object.keys(defaults).map(k=>({key:k,hasData:obj?.[k]!==undefined && JSON.stringify(obj[k])!==JSON.stringify(defaults[k])}));
}
function normalizeCloudData(raw){
  if(!raw || typeof raw!=='object') return null;
  // Accept both the old raw-state format and the new envelope format.
  if(raw.schemaVersion && raw.state && typeof raw.state==='object') return {schemaVersion:Number(raw.schemaVersion)||SYNC_SCHEMA_VERSION,state:raw.state,updatedAt:raw.updatedAt||null,tombstones:raw.tombstones||{}};
  if(raw.state && typeof raw.state==='object' && Object.keys(raw).length<=4) return {schemaVersion:1,state:raw.state,updatedAt:raw.updatedAt||null,tombstones:raw.tombstones||{}};
  return {schemaVersion:1,state:raw,updatedAt:null,tombstones:{}};
}
function mergeDefaultsIntoState(candidate){
  const merged={};
  for(const k of Object.keys(defaults)) merged[k]=candidate?.[k]!==undefined ? candidate[k] : JSON.parse(JSON.stringify(defaults[k]));
  return merged;
}
function canonicalize(value){
  if(Array.isArray(value)) return value.map(canonicalize);
  if(value && typeof value==='object'){
    const out={};
    Object.keys(value).sort().forEach(k=>{ out[k]=canonicalize(value[k]); });
    return out;
  }
  return value;
}
function canonicalJson(value){
  return JSON.stringify(canonicalize(value));
}
function stateFingerprint(obj){
  try{
    // IMPORTANT: hash the ENTIRE canonical Life Management state. Never truncate the
    // serialized JSON itself; changes near the end (for example meals,
    // groceries, calendar, etc.) must change the fingerprint too.
    const json=canonicalJson(obj);
    let h1=2166136261>>>0;
    let h2=2246822519>>>0;
    for(let i=0;i<json.length;i++){
      const c=json.charCodeAt(i);
      h1^=c; h1=Math.imul(h1,16777619)>>>0;
      h2^=c; h2=Math.imul(h2,3266489917)>>>0;
      h2=(h2+((h1<<13)|(h1>>>19)))>>>0;
    }
    // Add length so even equal hash prefixes cannot be treated as equal.
    return [h1,h2,json.length>>>0].map(n=>n.toString(16).padStart(8,'0')).join('');
  }catch(e){
    return 'fingerprint-error';
  }
}
function valuesEqual(a,b){ return canonicalJson(a)===canonicalJson(b); }
function recordKey(item){
  if(item && typeof item==='object' && item.id!=null) return 'id:'+String(item.id);
  return 'json:'+canonicalJson(item);
}
function threeWayMergeValues(localValue,cloudValue,baseValue){
  if(valuesEqual(localValue,baseValue)) return cloudValue;
  if(valuesEqual(cloudValue,baseValue)) return localValue;
  if(Array.isArray(localValue)||Array.isArray(cloudValue)||Array.isArray(baseValue)){
    const la=Array.isArray(localValue)?localValue:[], ca=Array.isArray(cloudValue)?cloudValue:[], ba=Array.isArray(baseValue)?baseValue:[];
    const lm=new Map(la.map(x=>[recordKey(x),x])), cm=new Map(ca.map(x=>[recordKey(x),x])), bm=new Map(ba.map(x=>[recordKey(x),x]));
    const order=[];
    for(const x of ba) order.push(recordKey(x));
    for(const x of ca) if(!order.includes(recordKey(x))) order.push(recordKey(x));
    for(const x of la) if(!order.includes(recordKey(x))) order.push(recordKey(x));
    const out=[];
    for(const key of order){
      const merged=threeWayMergeValues(lm.get(key),cm.get(key),bm.get(key));
      if(merged!==undefined) out.push(merged);
    }
    return out;
  }
  if(localValue&&typeof localValue==='object' && cloudValue&&typeof cloudValue==='object'){
    const bo=baseValue&&typeof baseValue==='object'?baseValue:{};
    const keys=new Set([...Object.keys(bo),...Object.keys(cloudValue),...Object.keys(localValue)]);
    const out={};
    for(const k of keys){ const merged=threeWayMergeValues(localValue[k],cloudValue[k],bo[k]); if(merged!==undefined) out[k]=merged; }
    return out;
  }
  return localValue;
}
function mergeLedgerStates(localState,cloudState,baseState){
  const merged={};
  for(const k of Object.keys(defaults)) merged[k]=threeWayMergeValues(localState?.[k],cloudState?.[k],baseState?.[k]);
  return mergeDefaultsIntoState(merged);
}
async function applyMergedStateAndUpload(cloudState,reason='multi-device-merge',cloudTombstones={},baseState=null){
  const beforeFp=stateFingerprint(state);
  // We have just read the current cloud state. Rebase the safety baseline to
  // that exact cloud copy before uploading the merged result. Otherwise the
  // upload safety guard compares against the OLD baseline and incorrectly
  // reports "the cloud changed since this device last synced" even though
  // we are intentionally merging that cloud change right now.
  const cloudBaselineFp=stateFingerprint(cloudState);
  const existingMeta=await readSyncMeta()||{};
  await writeSyncMeta({
    ...existingMeta,
    schemaVersion:SYNC_SCHEMA_VERSION,
    cloudUpdatedAt:existingMeta.cloudUpdatedAt||null,
    localRevision,
    fingerprint:cloudBaselineFp,
    baseState:cloneJson(cloudState),
    tombstones:mergeTombstones(existingMeta.tombstones||{},cloudTombstones||{}),
    pendingDomains:existingMeta.pendingDomains||[]
  });
  await setSyncDirty(true);

  const localTombstones=await readLocalTombstones();
  const allTombstones=mergeTombstones(localTombstones,cloudTombstones);
  const merged=applyTombstonesToState(mergeLedgerStates(state,cloudState,baseState||{}),allTombstones);
  const mergedFp=stateFingerprint(merged);
  if(mergedFp!==beforeFp){
    await withSyncTimeout(()=>saveLocalSnapshot(),5000,'Local snapshot');
    state=merged;
    localRevision++;
    for(const k of Object.keys(defaults)) await withSyncTimeout(()=>window.storage.set(k,JSON.stringify(state[k]),false),5000,'Merged local data write');
    scheduleLocalSnapshot();
    renderShell();
  }
  syncLog('Changes merged','Local and cloud records combined without replacing either device');
  syncStatus='Uploading…'; updateAuthUI();
  return uploadLocalState(reason,cloudTombstones||{});
}

function syncLog(stage,detail=''){
  window.__ledgerSyncStage=stage;
  window.__ledgerSyncDetail=detail||'';
  const st=document.getElementById('authStatus');
  if(st) st.textContent=detail?stage+' · '+detail:stage;
  console.info('[Life Management Sync]',stage,detail||'');
}
function syncErrorText(err){
  if(!err) return 'Unknown sync error.';
  return err.message || err.error_description || err.details || String(err);
}
async function withSyncTimeout(task, ms=15000, label='Sync request'){
  let timer;
  let settled=false;
  const timeout=new Promise((_,reject)=>{ timer=setTimeout(()=>{ if(!settled) reject(new Error(label+' timed out after '+Math.round(ms/1000)+' seconds. Your local data is still safe.')); },ms); });
  try{
    return await Promise.race([Promise.resolve().then(task),timeout]);
  }finally{
    settled=true;
    clearTimeout(timer);
  }
}
async function getFreshSupabaseSession(){
  if(!supabaseClient) throw new Error('Supabase client is not initialized.');
  syncLog('Connecting to Supabase…','Checking session');
  const res=await withSyncTimeout(()=>supabaseClient.auth.getSession(),10000,'Supabase session check');
  if(res?.error) throw res.error;
  const session=res?.data?.session;
  supabaseUser=session?.user||null;
  if(!session||!supabaseUser) throw new Error('Your Life Management session has expired. Please sign in again.');
  syncLog('Signed in','Session valid');
  return session;
}
async function fetchCloudState(){
  await getFreshSupabaseSession();
  syncLog('Reading cloud…','Loading your Life Management');
  const request=()=>supabaseClient.from('ledger_user_data').select('user_id,data,updated_at').eq('user_id',supabaseUser.id).maybeSingle();
  const result=await withSyncTimeout(request,15000,'Cloud read');
  const {data,error}=result||{};
  if(error) throw new Error('Cloud read failed: '+error.message+(error.details?' · '+error.details:''));
  syncLog('Cloud read complete',data?'Cloud row found':'No cloud row yet');
  return data||null;
}
async function uploadLocalState(reason='manual',remoteTombstones={}){
  if(!supabaseUser||!supabaseClient) throw new Error('Please sign in before syncing.');
  if(!navigator.onLine) throw new Error('You are offline. Your changes are safe locally and will sync when you reconnect.');
  await getFreshSupabaseSession();
  const safetyRead=await withSyncTimeout(()=>supabaseClient.from('ledger_user_data').select('user_id,data,updated_at').eq('user_id',supabaseUser.id).maybeSingle(),15000,'Cloud safety check');
  if(safetyRead?.error) throw new Error('Cloud safety check failed: '+safetyRead.error.message);
  const currentRow=safetyRead?.data||null;
  const localMetaBefore=await readSyncMeta();
  const uploadBlock=cloudUploadMustBeBlocked(currentRow,localMetaBefore);
  if(uploadBlock) throw new Error(uploadBlock);
  syncLog('Preparing upload…','Saving local safety snapshot');
  await withSyncTimeout(()=>saveLocalSnapshot(),5000,'Local snapshot');
  const now=new Date().toISOString();
  const localTombstones=await readLocalTombstones();
  // Tombstones are cumulative across devices. Never let a device with no
  // local deletions erase deletion markers that already exist in the cloud.
  const mergedTombstones=mergeTombstones(localTombstones,remoteTombstones||{});
  const fullState=applyTombstonesToState(mergeDefaultsIntoState(JSON.parse(JSON.stringify(state))),mergedTombstones);
  if(stateFingerprint(fullState)!==stateFingerprint(state)){
    state=fullState;
    for(const k of Object.keys(defaults)) await withSyncTimeout(()=>window.storage.set(k,JSON.stringify(state[k]),false),5000,'Tombstone cleanup write');
  }
  const envelope={schemaVersion:SYNC_SCHEMA_VERSION,revision:localRevision,state:fullState,updatedAt:now,tombstones:mergedTombstones};
  const payload={user_id:supabaseUser.id,data:envelope,updated_at:now};
  syncLog('Uploading…','Sending complete Life Management state');
  const request=()=>supabaseClient.from('ledger_user_data').upsert(payload,{onConflict:'user_id'}).select('user_id,data,updated_at').single();
  const result=await withSyncTimeout(request,15000,'Cloud write');
  const {data,error}=result||{};
  if(error) throw new Error('Cloud write failed: '+error.message+(error.details?' · '+error.details:''));
  if(!data?.user_id) throw new Error('Cloud write returned no saved row. Check the ledger_user_data table and RLS policies.');
  syncLog('Verifying…','Checking saved cloud row');
  const saved=normalizeCloudData(data.data);
  if(!saved?.state) throw new Error('Cloud write succeeded but the returned Life Management data is invalid.');
  const uploadedFp=stateFingerprint(fullState);
  const returnedFp=stateFingerprint(saved.state);
  if(uploadedFp!==returnedFp) throw new Error('Cloud verification failed: Supabase returned data different from the Life Management state that was uploaded. This is a data mismatch, not a connection error.');
  await writeSyncMeta({schemaVersion:SYNC_SCHEMA_VERSION,cloudUpdatedAt:data.updated_at||now,localRevision,reason,fingerprint:uploadedFp,baseState:fullState,tombstones:mergedTombstones,pendingDomains:[]});
  await setSyncDirty(false);
  syncConflictPending=false;
  syncStatus='Synced · '+new Date(data.updated_at||now).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  syncLog('✓ Synced','Cloud copy verified');
  updateAuthUI();
  return true;
}
async function downloadCloudState(row){
  const normalized=normalizeCloudData(row?.data);
  if(!normalized || !normalized.state) throw new Error('The cloud Life Management data is invalid or incomplete.');
  // HARD SAFETY RULE: never replace meaningful local Life Management data silently.
  // A fresh PWA/account-scoped store may contain only defaults or migration
  // markers; those are NOT user data and must be allowed to hydrate from cloud.
  // Only meaningful local records/settings block an implicit cloud download.
  if(localStateHasMeaningfulData() && !window.__ledgerExplicitCloudDownload){
    throw new Error('Cloud download blocked: this device has local Life Management data. Nothing was replaced.');
  }
  syncLog('Protecting local data…','Saving safety snapshot');
  await withSyncTimeout(()=>saveLocalSnapshot(),5000,'Local snapshot');
  const safe=mergeDefaultsIntoState(normalized.state);
  state=safe;
  syncLog('Applying cloud data…','Updating local Life Management');
  for(const k of Object.keys(defaults)) await withSyncTimeout(()=>window.storage.set(k,JSON.stringify(state[k]),false),5000,'Local data write');
  localRevision=Math.max(localRevision,Number(normalized.revision)||0);
  await withSyncTimeout(()=>saveLocalSnapshot(),5000,'Local snapshot');
  await writeSyncMeta({schemaVersion:SYNC_SCHEMA_VERSION,cloudUpdatedAt:row.updated_at||normalized.updatedAt||new Date().toISOString(),localRevision,fingerprint:stateFingerprint(state),baseState:JSON.parse(JSON.stringify(state)),tombstones:cloneJson(normalized.tombstones||{}),pendingDomains:[]});
  await setSyncDirty(false);
  syncConflictPending=false;
  syncStatus='Downloaded from cloud';
  syncLog('✓ Downloaded','Cloud data applied locally');
  updateAuthUI(); renderShell(); return true;
}
function cloudIsValidLedger(row){
  const n=normalizeCloudData(row?.data);
  if(!n||!n.state) return false;
  const keys=Object.keys(defaults);
  const present=keys.filter(k=>n.state[k]!==undefined);
  return present.length>=Math.max(3,Math.floor(keys.length*0.6));
}
async function localChangesSinceLastSync(meta, localFp){
  if(await isSyncDirty()) return true;
  if(!meta || !meta.fingerprint) return false;
  if(localFp !== meta.fingerprint) return true;
  return Number(localRevision||0) > Number(meta.localRevision||0);
}
function cloudUnchangedSinceLastSync(meta, cloudFp){
  return !!(meta && meta.fingerprint && cloudFp === meta.fingerprint);
}
function isNetworkSyncError(err){
  const msg=String(syncErrorText(err)||'').toLowerCase();
  return !navigator.onLine || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network error') || msg.includes('load failed') || msg.includes('fetch failed') || msg.includes('timed out') || msg.includes('err_connection') || msg.includes('connection refused') || msg.includes('network is unreachable') || msg.includes('socket');
}
let lastSyncFailureKey='';
let lastSyncFailureAt=0;
function showSyncFailure(err,stage,silent=false){
  const msg=syncErrorText(err);
  const failureKey=String(stage)+'|'+String(msg);
  const nowMs=Date.now();
  if(failureKey===lastSyncFailureKey && nowMs-lastSyncFailureAt<15000){
    syncStatus='Action needed';
    syncLog('Sync blocked',stage+' · '+msg);
    updateAuthUI();
    return;
  }
  lastSyncFailureKey=failureKey; lastSyncFailureAt=nowMs;
  // Network failures are never a blocking UI error. Offline edits must remain
  // usable even when the browser incorrectly reports navigator.onLine=true.
  if(isNetworkSyncError(err) || /failed to fetch|networkerror|network error|load failed|fetch failed|connection reset|connection refused|timed out/i.test(msg)){
    syncStatus='Offline · saved locally';
    syncLog('Offline','Cloud connection unavailable; changes remain local');
    updateAuthUI();
    return;
  }
  syncStatus=silent?'Sync pending · retrying automatically':'✕ Sync failed';
  syncLog(silent?'Sync pending':'✕ Sync failed',stage+' · '+msg);
  updateAuthUI();
  if(silent) return;
  openModal('Sync failed','<div class="form-col"><div class="sync-note"><strong>Stage:</strong> '+esc(stage)+'</div><div class="sync-note"><strong>Error:</strong><br>'+esc(msg)+'</div><div class="sync-note">Your local Life Management data was not deleted or replaced.</div><div class="form-row"><button class="btn btn-primary" onclick="closeModal();syncNow()">Retry</button><button class="btn btn-ghost" onclick="closeModal()">Close</button></div></div>');
}
async function handleSignedIn(){
  if(!supabaseUser||!navigator.onLine||syncBusy)return;
  syncBusy=true;
  try{
    syncLog('Preparing sync…','Checking local and cloud data');
    await withSyncTimeout(()=>saveLocalSnapshot(),5000,'Local snapshot');
    syncLog('Local snapshot complete','Local data protected');
    const row=await fetchCloudState();
    syncLog('Cloud read complete',row?'Cloud row found':'No cloud row yet');
    if(!row){
      if(localStateHasMeaningfulData()){
        syncLog('Local data found','No cloud copy yet; uploading automatically');
        syncStatus='Uploading…'; updateAuthUI();
        await uploadLocalState('first-device-upload');
      }else{
        syncStatus='✓ Ready';
        syncLog('✓ Ready','No cloud data yet and this device is empty');
        updateAuthUI();
      }
      return;
    }
    syncLog('Validating cloud…','Checking Life Management schema');
    if(!cloudIsValidLedger(row)){
      if(localStateHasData()){
        syncLog('Legacy cloud copy','Current account data found locally; repairing cloud automatically');
        syncStatus='Uploading…'; updateAuthUI();
        await uploadLocalState('repair-incomplete-cloud');
      }else{
        throw new Error('The cloud Life Management copy is incomplete or legacy, and this device has no local data to safely repair it.');
      }
      return;
    }
    syncLog('Cloud schema valid','Complete Life Management state found');
    const localHas=localStateHasMeaningfulData();
    syncLog('Local data checked',localHas?'This device has Life Management data':'This device is empty');
    if(!localHas){
      syncStatus='Downloading…'; updateAuthUI();
      await downloadCloudState(row);
      return;
    }
    syncLog('Comparing data…','Calculating local/cloud fingerprints');
    let localMeta=await readSyncMeta();
    const normalized=normalizeCloudData(row.data);
    if(!normalized?.state) throw new Error('Cloud data was read but could not be normalized into a Life Management state.');
    const localFp=stateFingerprint(state);
    const cloudFp=stateFingerprint(normalized.state);
    // V40 did not persist a full base snapshot. On the first V41 sync, if the
    // legacy metadata fingerprint matches the current local state, the cloud
    // copy is a safe baseline for one-way local offline edits/deletes. Once a
    // V41 sync completes, baseState is persisted for proper three-way merges.
    if(!localMeta?.baseState){
      // V41 could have no reliable baseline after an older migration. For the
      // current account, the cloud copy becomes the baseline; local differences
      // are then treated as this device's offline changes. This is what lets a
      // deletion remain a deletion instead of being resurrected by merge.
      localMeta={...(localMeta||{}),schemaVersion:SYNC_SCHEMA_VERSION,baseState:cloneJson(normalized.state)};
      await writeSyncMeta(localMeta);
    }
    if(localMeta?.fingerprint && localFp!==localMeta.fingerprint) await setSyncDirty(true);
    const localDirty=await hasLocalChangesPending();
    const cloudUnchangedSinceLocalBaseline=!!(localMeta?.fingerprint && cloudFp===localMeta.fingerprint);
    syncLog('Comparison complete',localFp===cloudFp?'States are identical':(localDirty?'Local/cloud changes detected':'Cloud changes detected'));
    // IMPORTANT: when this device has a local edit and the cloud has not changed
    // since the last successful sync, upload the edited state directly. This
    // avoids the generic merge path accidentally treating an ordinary edit as
    // a remote conflict. The edit is already protected by the local snapshot.
    if(localDirty && cloudUnchangedSinceLocalBaseline && localFp!==cloudFp){
      syncStatus='Uploading…'; updateAuthUI();
      await uploadLocalState('local-edit-direct',normalized.tombstones||{});
      return;
    }
    if(localFp===cloudFp){
      // If the dirty flag is set, prefer an explicit upload rather than
      // clearing the flag. This protects against stale/corrupt sync metadata.
      if(await isSyncDirty()){
        syncLog('Local changes pending','Fingerprint matches cloud; re-verifying by upload');
        syncStatus='Uploading…';
        updateAuthUI();
        await uploadLocalState('pending-local-changes',normalized.tombstones||{});
        return;
      }
      await writeSyncMeta({...(localMeta||{}),cloudUpdatedAt:row.updated_at,localRevision,fingerprint:cloudFp,baseState:JSON.parse(JSON.stringify(normalized.state))});
      await setSyncDirty(false);
      syncStatus='✓ Synced';
      syncLog('✓ Synced','Local and cloud are identical');
      updateAuthUI();
      return;
    }
    // Both sides differ. Merge records from both devices instead of replacing
    // one complete Life Management state with the other. This preserves offline and
    // multi-device additions without showing a conflict prompt.
    await applyMergedStateAndUpload(normalized.state,'multi-device-merge',normalized.tombstones||{},localMeta?.baseState||{});
    return;

  }catch(e){
    console.error('initial sync failed',e);
    showSyncFailure(e,window.__ledgerSyncStage||'Initial sync');
  }finally{
    syncBusy=false;
  }
}
function openMigrationChoiceModal(row,message){
  openModal('Safe Life Management Migration','<div class="form-col"><div class="sync-note">'+esc(message)+'</div><div class="sync-note"><strong>Local data is protected.</strong><br>Your current device snapshot is saved before any cloud operation.</div><div class="form-row"><button class="btn btn-primary" onclick="syncUseLocal()">Repair Cloud From This Device</button><button class="btn btn-ghost" onclick="closeModal()">Not now</button></div></div>');
}
function openSyncChoiceModal(row){
  syncConflictPending=true;
  syncStatus='Ready';
  updateAuthUI();
}
async function syncUseCloud(){
  if(syncBusy)return;
  syncConflictPending=false;
  updateAuthUI();
  syncBusy=true;
  window.__ledgerExplicitCloudDownload=true;
  try{ closeModal(); syncStatus='Downloading…'; updateAuthUI(); await fetchCloudState().then(row=>downloadCloudState(row)); }
  catch(e){ console.error(e); showSyncFailure(e,window.__ledgerSyncStage||'Cloud download'); }
  finally{ window.__ledgerExplicitCloudDownload=false; syncBusy=false; }
}
async function syncUseLocal(){
  if(syncBusy)return;
  syncConflictPending=false;
  updateAuthUI();
  syncBusy=true;
  try{ closeModal(); syncStatus='Uploading…'; updateAuthUI(); await uploadLocalState('user-approved-migration-or-sync'); }
  catch(e){ console.error(e); showSyncFailure(e,window.__ledgerSyncStage||'Cloud upload'); }
  finally{ syncBusy=false; }
}
async function syncNow(background=false){
  if(syncBusy){ syncStatus='Sync already in progress'; updateAuthUI(); scheduleCloudSync(1500); return; }
  if(!supabaseUser){openAuthModal();return;}
  if(!navigator.onLine){syncStatus='Offline · changes saved locally';updateAuthUI();return;}
  let slowTimer=null;
  try{
    syncBusy=true;
    syncStatus='Syncing…';
    syncLog('Syncing…','Starting');
    updateAuthUI();
    slowTimer=setTimeout(()=>{ if(syncBusy){ syncStatus='Still syncing…'; syncLog('Still syncing…','Waiting for Supabase'); updateAuthUI(); } },5000);
    await withSyncTimeout(()=>saveLocalSnapshot(),5000,'Local snapshot');
    syncLog('Local snapshot complete','Local data protected');
    const row=await fetchCloudState();
    syncLog('Cloud read complete',row?'Cloud row found':'No cloud row yet');
    if(!row){
      if(localStateHasMeaningfulData()){
        syncLog('Local data found','No cloud copy yet; uploading automatically');
        syncStatus='Uploading…'; updateAuthUI();
        await uploadLocalState('first-device-upload');
      }else{
        syncStatus='✓ Ready';
        syncLog('✓ Ready','No cloud data yet and this device is empty');
        updateAuthUI();
      }
      return;
    }
    syncLog('Validating cloud…','Checking Life Management schema');
    if(!cloudIsValidLedger(row)){
      if(localStateHasData()){
        syncLog('Legacy cloud copy','Current account data found locally; repairing cloud automatically');
        syncStatus='Uploading…'; updateAuthUI();
        await uploadLocalState('repair-incomplete-cloud');
      }else{
        throw new Error('The cloud Life Management copy is incomplete or legacy, and this device has no local data to safely repair it.');
      }
      return;
    }
    syncLog('Cloud schema valid','Complete Life Management state found');
    const localHasMeaningful=localStateHasMeaningfulData();
    const cloudNormalized=normalizeCloudData(row.data);
    const cloudHasMeaningful=cloudStateHasMeaningfulData(cloudNormalized);
    syncLog('Local data checked',localHasMeaningful?'This device has Life Management data':'This device is empty');
    if(!localHasMeaningful){
      syncStatus='Downloading…'; updateAuthUI();
      await downloadCloudState(row);
      return;
    }
    if(!cloudHasMeaningful){
      throw new Error('Cloud contains no meaningful Life Management data. Upload was blocked to prevent an empty or reset cloud state from causing data loss.');
    }
    syncLog('Comparing data…','Calculating local/cloud fingerprints');
    let localMeta=await readSyncMeta();
    const localFp=stateFingerprint(state);
    const normalized=normalizeCloudData(row.data);
    if(!normalized?.state) throw new Error('Cloud data was read but could not be normalized into a Life Management state.');
    const cloudFp=stateFingerprint(normalized.state);
    if(!localMeta?.baseState){
      localMeta={...(localMeta||{}),schemaVersion:SYNC_SCHEMA_VERSION,baseState:cloneJson(normalized.state)};
      await writeSyncMeta(localMeta);
    }
    if(localMeta?.fingerprint && localFp!==localMeta.fingerprint) await setSyncDirty(true);
    const localDirty=await hasLocalChangesPending();
    const cloudUnchangedSinceLocalBaseline=!!(localMeta?.fingerprint && cloudFp===localMeta.fingerprint);
    syncLog('Comparison complete',localFp===cloudFp?'States are identical':(localDirty?'Local/cloud changes detected':'Cloud changes detected'));
    // IMPORTANT: when this device has a local edit and the cloud has not changed
    // since the last successful sync, upload the edited state directly. This
    // avoids the generic merge path accidentally treating an ordinary edit as
    // a remote conflict. The edit is already protected by the local snapshot.
    if(localDirty && cloudUnchangedSinceLocalBaseline && localFp!==cloudFp){
      syncStatus='Uploading…'; updateAuthUI();
      await uploadLocalState('local-edit-direct',normalized.tombstones||{});
      return;
    }
    if(localFp===cloudFp){
      // If the dirty flag is set, prefer an explicit upload rather than
      // clearing the flag. This protects against stale/corrupt sync metadata.
      if(await isSyncDirty()){
        syncLog('Local changes pending','Fingerprint matches cloud; re-verifying by upload');
        syncStatus='Uploading…';
        updateAuthUI();
        await uploadLocalState('pending-local-changes',normalized.tombstones||{});
        return;
      }
      await writeSyncMeta({...(localMeta||{}),cloudUpdatedAt:row.updated_at,localRevision,fingerprint:cloudFp,baseState:JSON.parse(JSON.stringify(normalized.state))});
      await setSyncDirty(false);
      syncStatus='✓ Synced';
      syncLog('✓ Synced','Local and cloud are identical');
      updateAuthUI();
      return;
    }
    // Both sides differ. Merge records from both devices instead of replacing
    // one complete Life Management state with the other. This preserves offline and
    // multi-device additions without showing a conflict prompt.
    await applyMergedStateAndUpload(normalized.state,'multi-device-merge',normalized.tombstones||{},localMeta?.baseState||{});
    return;
  }catch(e){
    console.error('sync failed',e);
    showSyncFailure(e,window.__ledgerSyncStage||'Unknown stage',background);
  }finally{
    if(slowTimer) clearTimeout(slowTimer);
    syncBusy=false;
    if(syncStatus==='Syncing…' || syncStatus==='Still syncing…'){
      syncStatus='Sync failed';
      updateAuthUI();
    } else if(navigator.onLine && supabaseUser && syncStatus!=='Action needed' && syncStatus!=='Migration needed'){
      if(await hasLocalChangesPending() && navigator.onLine) scheduleCloudSync(1200);
    }
  }
}
function scheduleCloudSync(delay=900){
  if(!supabaseUser||!navigator.onLine)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>syncNow(true).catch(()=>{}),delay);
}
function startSyncMonitor(){
  if(syncMonitorTimer) return;
  // IMPORTANT: sync is not only an upload mechanism. A device with no local
  // edits still has to pull changes made by another device. Poll the cloud
  // periodically so edits and deletions propagate to every signed-in device.
  syncMonitorTimer=setInterval(async()=>{
    try{
      if(!supabaseUser || !navigator.onLine || syncBusy) return;
      const pending=await hasLocalChangesPending();
      if(pending){
        syncStatus='Online · local changes pending';
        updateAuthUI();
      }
      // Always schedule a cloud comparison. syncNow() performs a three-way
      // merge, so this is safe when there are no local changes and is what
      // makes remote edits/deletes arrive on otherwise idle devices.
      scheduleCloudSync(pending?250:300);
    }catch(e){ console.warn('[Life Management Sync] monitor',e); }
  },5000);
}
window.addEventListener('online',async()=>{ if(supabaseUser){const pending=await hasLocalChangesPending();syncStatus=pending?'Online · local changes pending':'Online · syncing…';updateAuthUI();scheduleCloudSync(250); } });
window.addEventListener('offline',()=>{ if(supabaseUser){syncStatus='Offline · saved locally';updateAuthUI();} });
window.addEventListener('focus',()=>{ if(supabaseUser && navigator.onLine) scheduleCloudSync(150); });
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && supabaseUser && navigator.onLine) scheduleCloudSync(150); });
startSyncMonitor();

/* ---------- dispatch + init ---------- */
const RENDERERS={ messages:renderMessages, home:renderHome, dashboard:renderDashboard, money:renderMoney, trading:renderTrading, habits:renderHabits, running:renderRunning, workout:renderWorkout, meals:renderMeals, sleepwater:renderSleepWater, calendar:renderCalendar, reading:renderReading, journal:renderJournal, groceries:renderGroceries };

async function init(){
  try{
    initSupabase();
    if(!supabaseClient){ renderAuthScreen('signin','Supabase is not configured.'); return; }

    // Recovery links must take precedence over any account already signed in
    // on this browser. This is important when Account B requests a reset on
    // a phone but the email link is opened on a PC currently signed in as A.
    if(authRecoveryInProgress){
      renderAuthScreen('recovery','Opening the password reset for this email…');
      // Supabase may finish processing the recovery URL asynchronously. Give
      // the auth listener a moment to receive PASSWORD_RECOVERY. If a session
      // is already available, verify it is the recovery session before showing
      // the form. Never enter the normal app from an existing browser session.
      setTimeout(async()=>{
        try{
          const {data,error}=await supabaseClient.auth.getSession();
          if(error) throw error;
          const session=data?.session;
          if(session?.user){
            supabaseUser=session.user;
            renderAuthScreen('recovery');
          }else{
            renderAuthScreen('signin','This password reset link is invalid or has expired. Request a new one.');
          }
        }catch(err){
          console.error(err);
          renderAuthScreen('signin','This password reset link is invalid or has expired. Request a new one.');
        }
      },1200);
      return;
    }

    const {data,error}=await supabaseClient.auth.getSession();
    if(error) throw error;
    supabaseUser=data.session?.user||null;
    syncStatus=supabaseUser?(navigator.onLine?'Signed in':'Signed in · offline'):'Not signed in';
    if(supabaseUser) await enterAuthenticatedApp();
    else renderAuthScreen('signin');
  }catch(err){
    console.error(err);
    appRoot.innerHTML='<div class="loading">Unable to initialize Life Management authentication. Check your connection and reload.</div>';
  }
}
init();

// PWA service worker: cache the app shell for offline launch.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => { console.log('[Life Management PWA] service worker ready', reg.scope); }).catch(err => console.warn('[Life Management PWA] service worker', err));
  });
}
