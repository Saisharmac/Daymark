/* Daymark — local-first calendar planner */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;
  const DEFAULT_LABELS = [
    { name: 'Study', color: '#82a9b4', bg: '#eaf2f4' },
    { name: 'Work', color: '#9b9ab8', bg: '#f0eff6' },
    { name: 'Personal', color: '#c39c76', bg: '#f6eee4' },
    { name: 'Health', color: '#8eaa91', bg: '#edf3eb' },
    { name: 'Finance', color: '#c38f8b', bg: '#f7ecea' },
    { name: 'Projects', color: '#7d9da0', bg: '#eaf1f0' }
  ];
  const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
  const PRIORITY_WEIGHT = { urgent: 0, high: 1, medium: 2, low: 3 };
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let tasks = [];
  let labels = loadLabels();
  let settings = loadSettings();
  let selectedDate = dateKey(new Date());
  let cursorDate = new Date(selectedDate + 'T12:00:00');
  let currentView = 'month';
  let activeFocus = 'all';
  let searchQuery = '';
  let activeLabel = 'all';
  let activePriority = 'all';
  let activeStatus = 'open';
  let dbPromise;
  let toastTimer;
  let serviceWorkerRegistration = null;

  function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function parseDate(s) { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, (m||1)-1, d||1, 12); }
  function addDays(d,n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
  function startOfWeek(d) { const x = new Date(d); const offset = (x.getDay()+6)%7; x.setDate(x.getDate()-offset); x.setHours(12,0,0,0); return x; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : `dm-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function niceDate(s, options={weekday:'long',day:'numeric',month:'long'}) { return parseDate(s).toLocaleDateString(undefined, options); }
  function labelFor(name) { return labels.find(l => l.name === name) || {name:name||'Other',color:'#8ca2a1',bg:'#eef2ef'}; }
  function loadLabels() { try { const v=JSON.parse(localStorage.getItem('daymark.labels')||'null'); if(!Array.isArray(v)||!v.length)return DEFAULT_LABELS.map(x=>({...x})); return v.filter(x=>x&&typeof x.name==='string').map((x,i)=>({name:x.name,color:/^#[0-9a-fA-F]{6}$/.test(x.color||'')?x.color:DEFAULT_LABELS[i%DEFAULT_LABELS.length].color,bg:/^#[0-9a-fA-F]{6}$/.test(x.bg||'')?x.bg:DEFAULT_LABELS[i%DEFAULT_LABELS.length].bg})); } catch { return DEFAULT_LABELS.map(x=>({...x})); } }
  function loadSettings() { try { return {...{dailyReminder:false,dailyTime:'07:00',lastMorningDate:'',weekStartsMonday:true},...JSON.parse(localStorage.getItem('daymark.settings')||'{}')}; } catch { return {dailyReminder:false,dailyTime:'07:00',lastMorningDate:'',weekStartsMonday:true}; } }
  function saveSettings() { localStorage.setItem('daymark.settings', JSON.stringify(settings)); }
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is unavailable'));
      const req = indexedDB.open('daymark-planner',1);
      req.onupgradeneeded = () => { const db=req.result; if(!db.objectStoreNames.contains('tasks')) { const store=db.createObjectStore('tasks',{keyPath:'id'}); store.createIndex('date','date',{unique:false}); } };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
    return dbPromise;
  }
  async function dbAll() { const db=await openDB(); return new Promise((resolve,reject)=>{const r=db.transaction('tasks','readonly').objectStore('tasks').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);}); }
  async function dbPut(item) { const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').put(item);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); }
  async function dbDelete(id) { const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); }
  async function dbBulk(items) { const db=await openDB(); return new Promise((resolve,reject)=>{const tx=db.transaction('tasks','readwrite');const store=tx.objectStore('tasks');items.forEach(x=>store.put(x));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); }
  function toast(message) { const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2600); }
  function setSaveStatus(text='All changes saved on this device') { $('saveStatus').textContent=text; }
  function filteredTasks() {
    let list=tasks.slice();
    if (activeFocus==='today') list=list.filter(t=>t.date===dateKey(new Date()));
    if (activeFocus==='upcoming') list=list.filter(t=>t.date>=dateKey(new Date())&&!t.done);
    if (activeFocus==='overdue') list=list.filter(t=>t.date<dateKey(new Date())&&!t.done);
    if (activeLabel!=='all') list=list.filter(t=>t.label===activeLabel);
    if (activePriority!=='all') list=list.filter(t=>t.priority===activePriority);
    if (activeStatus==='open') list=list.filter(t=>!t.done);
    if (activeStatus==='done') list=list.filter(t=>t.done);
    if (searchQuery) { const q=searchQuery.toLowerCase(); list=list.filter(t=>[t.title,t.notes,t.label,...(t.tags||[])].join(' ').toLowerCase().includes(q)); }
    return list;
  }
  function sortTasks(list) { return list.slice().sort((a,b)=>Number(a.done)-Number(b.done)||(PRIORITY_WEIGHT[a.priority]??2)-(PRIORITY_WEIGHT[b.priority]??2)||(a.startTime||'99:99').localeCompare(b.startTime||'99:99')||a.title.localeCompare(b.title)); }
  function tasksOn(date, source=tasks) { return sortTasks(source.filter(t=>t.date===date)); }
  function visibleTasksOn(date) { return tasksOn(date,filteredTasks()); }
  function safeTextDateLabel(d) { return d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'}); }
  function updateStats() {
    const today=dateKey(new Date()); const open=tasks.filter(t=>!t.done).length; const done=tasks.filter(t=>t.done).length; const high=tasks.filter(t=>!t.done&&(t.priority==='urgent'||t.priority==='high')).length;
    const day=tasksOn(today); const dayDone=day.filter(t=>t.done).length; const pct=day.length?Math.round(dayDone/day.length*100):0;
    $('statOpen').textContent=open; $('statDone').textContent=done; $('statHigh').textContent=high; $('statProgress').textContent=pct+'%'; $('progressFill').style.width=pct+'%';
  }
  function updatePeriodHeading() {
    let title='',sub='';
    if(currentView==='month') {title=cursorDate.toLocaleDateString(undefined,{month:'long',year:'numeric'});sub='A full month, with every commitment in view.';}
    if(currentView==='week') {const s=startOfWeek(cursorDate),e=addDays(s,6);title=`${s.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${e.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`;sub='A clear view of the week ahead.';}
    if(currentView==='day') {title=niceDate(selectedDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'});sub='Give this day a realistic shape.';}
    if(currentView==='year') {title=String(cursorDate.getFullYear());sub='The shape of your year, one month at a time.';}
    $('periodHeading').textContent=title; $('periodSubheading').textContent=sub; $('calendarTitle').textContent=title; $('crumbView').textContent=currentView[0].toUpperCase()+currentView.slice(1)+' view';
    $('calendarHint').textContent=currentView==='year'?'Choose a month to explore its days':'Select a date to open its agenda';
    $('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  }
  function renderLabelOptions() {
    const options=labels.map(l=>`<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('');
    const labelFilter=$('labelFilter'); const old=labelFilter.value;
    labelFilter.innerHTML='<option value="all">All labels</option>'+options; labelFilter.value=labels.some(l=>l.name===old)?old:'all';
    $('taskLabel').innerHTML=options;
    $('sidebarLabels').innerHTML=labels.map(l=>`<button class="sidebar-label-button ${activeLabel===l.name?'selected':''}" data-label="${esc(l.name)}"><i class="label-dot" style="background:${l.color}"></i>${esc(l.name)} <span style="margin-left:auto;color:#a0aeaa;font-size:10px">${tasks.filter(t=>t.label===l.name&&!t.done).length}</span></button>`).join('');
    $('calendarLegend').innerHTML=labels.map(l=>`<span class="legend-item"><i style="background:${l.color}"></i>${esc(l.name)}</span>`).join('');
  }
  function chipStyle(task) { const l=labelFor(task.label); return `--chip:${l.color};--chip-bg:${l.bg}`; }
  function renderMonth() {
    const first=new Date(cursorDate.getFullYear(),cursorDate.getMonth(),1,12); const gridStart=startOfWeek(first); const today=dateKey(new Date()); const filtered=filteredTasks();
    let html='<div class="weekday-head">'+WEEKDAYS.map(d=>`<div>${d}</div>`).join('')+'</div><div class="month-grid">';
    for(let i=0;i<42;i++) { const d=addDays(gridStart,i), key=dateKey(d), inMonth=d.getMonth()===cursorDate.getMonth(), dayTasks=visibleTasksOn(key); const labelCounts={};dayTasks.forEach(t=>labelCounts[t.label]=(labelCounts[t.label]||0)+1);
      html+=`<div class="month-cell ${inMonth?'':'outside'} ${key===selectedDate?'selected':''} ${key===today?'today':''}" data-date="${key}" role="button" tabindex="0" aria-label="${esc(niceDate(key))}, ${dayTasks.length} tasks"><div class="cell-top"><span class="day-number">${d.getDate()}</span>${dayTasks.length?`<span class="day-count">${dayTasks.length}</span>`:''}</div>`;
      if(dayTasks.length) { html+='<div class="cell-label-counts">'+Object.entries(labelCounts).slice(0,3).map(([n,c])=>{const l=labelFor(n);return `<span class="mini-label-count" style="background:${l.bg};color:${l.color}">${esc(n)} ${c}</span>`;}).join('')+'</div>'; }
      dayTasks.slice(0,2).forEach(t=>{html+=`<div class="calendar-task-chip ${t.done?'done':''}" style="${chipStyle(t)}" title="${esc(t.title)}">${esc(t.title)}</div>`;});
      if(dayTasks.length>2) html+=`<div class="more-tasks">+${dayTasks.length-2} more</div>`;
      html+='</div>';
    }
    html+='</div>'; $('calendarHost').innerHTML=html;
  }
  function renderWeek() {
    const first=startOfWeek(cursorDate), filtered=filteredTasks();let html='<div class="week-grid">';
    for(let i=0;i<7;i++){const d=addDays(first,i),key=dateKey(d),dayTasks=visibleTasksOn(key);html+=`<div class="week-column ${key===selectedDate?'selected':''} ${key===dateKey(new Date())?'today':''}" data-date="${key}"><div class="week-day-head"><span>${WEEKDAYS[i]}</span><strong>${d.getDate()}</strong></div>`;
      if(!dayTasks.length) html+='<div class="week-empty">—</div>';
      dayTasks.forEach(t=>{html+=`<button class="week-task ${t.done?'done':''}" data-task-edit="${t.id}" style="${chipStyle(t)}"><small>${t.startTime?esc(t.startTime):'Anytime'} · ${esc(t.priority)}</small>${esc(t.title)}</button>`;});html+='</div>';}
    html+='</div>'; $('calendarHost').innerHTML=html;
  }
  function renderDay() {
    const key=selectedDate, dayTasks=visibleTasksOn(key), allday=dayTasks.filter(t=>!t.startTime), timed=dayTasks.filter(t=>t.startTime);let html=`<div class="day-view"><div class="day-view-head"><strong>${esc(niceDate(key,{weekday:'long',day:'numeric',month:'long'}))}</strong><span>${dayTasks.length} scheduled item${dayTasks.length===1?'':'s'}</span></div><div class="day-all-day"><span>Anytime</span><div class="day-all-day-content">${allday.length?allday.map(t=>`<button class="all-day-chip" data-task-edit="${t.id}" style="${chipStyle(t)}">${t.done?'✓ ':''}${esc(t.title)}</button>`).join(''):'<span class="week-empty">No anytime tasks</span>'}</div></div>`;
    for(let h=6;h<=22;h++){const time=`${String(h).padStart(2,'0')}:00`,matches=timed.filter(t=>Number(t.startTime.slice(0,2))===h);html+=`<div class="time-row"><div class="time-label">${h%12||12} ${h<12?'AM':'PM'}</div><div class="time-content">${matches.map(t=>`<button class="time-task" data-task-edit="${t.id}" style="${chipStyle(t)}">${esc(t.startTime)} ${esc(t.title)}</button>`).join('')}</div></div>`;}
    html+='</div>'; $('calendarHost').innerHTML=html;
  }
  function renderYear() {
    const y=cursorDate.getFullYear(),today=dateKey(new Date());let html='<div class="year-grid">';
    for(let m=0;m<12;m++){const first=new Date(y,m,1,12),start=startOfWeek(first);let total=0,monthHtml='<div class="mini-month">';WEEKDAYS.forEach(d=>monthHtml+=`<span>${d[0]}</span>`);
      for(let i=0;i<42;i++){const d=addDays(start,i);if(d.getMonth()!==m) {monthHtml+='<span></span>';continue;}const key=dateKey(d),count=visibleTasksOn(key).length;total+=count;monthHtml+=`<span class="mini-date ${count?'has-tasks':''} ${key===today?'today':''} ${key===selectedDate?'selected':''}" data-date="${key}">${d.getDate()}</span>`;}
      monthHtml+='</div>';html+=`<div class="year-month" data-month="${m}"><div class="year-month-title">${MONTHS[m]} <span>${total} task${total===1?'':'s'}</span></div>${monthHtml}<div class="year-month-total">${total?`${total} planned item${total===1?'':'s'}`:'No tasks planned'}</div></div>`;
    }
    html+='</div>'; $('calendarHost').innerHTML=html;
  }
  function taskRow(t) {
    const l=labelFor(t.label);const meta=[t.startTime?`<span class="task-time">${esc(t.startTime)}${t.endTime?'–'+esc(t.endTime):''}</span>`:'',`<span class="task-badge" style="background:${l.bg};color:${l.color}">${esc(t.label)}</span>`,`<span class="task-badge pr-${esc(t.priority)}">${esc(t.priority)}</span>`,(t.tags||[]).slice(0,2).map(tag=>`<span class="task-badge">#${esc(tag)}</span>`).join(''),t.reminderAt?'<span class="task-badge">♧ reminder</span>':'',t.repeat&&t.repeat!=='none'?'<span class="task-badge">↻ repeat</span>':''].filter(Boolean).join('');
    return `<div class="task-row" data-task-row="${t.id}"><button class="task-check ${t.done?'checked':''}" data-task-check="${t.id}" aria-label="${t.done?'Mark incomplete':'Complete task'}">${t.done?'✓':''}</button><div class="task-main"><div class="task-title ${t.done?'done':''}">${esc(t.title)}</div><div class="task-meta">${meta}</div>${t.notes?`<div class="task-meta">${esc(t.notes.slice(0,90))}${t.notes.length>90?'…':''}</div>`:''}</div><div class="task-actions"><button class="tiny-action" data-task-edit="${t.id}" title="Edit">✎</button><button class="tiny-action" data-task-delete="${t.id}" title="Delete">×</button></div></div>`;
  }
  function renderAgenda() {
    const list=tasksOn(selectedDate,filteredTasks()),all=tasksOn(selectedDate),done=all.filter(t=>t.done).length,open=all.length-done,used=new Set(all.map(t=>t.label));
    $('agendaDate').textContent=niceDate(selectedDate,{weekday:'short',day:'numeric',month:'short'});$('agendaSummary').textContent=selectedDate===dateKey(new Date())?'Your plan for today':niceDate(selectedDate,{weekday:'long',year:'numeric'});
    $('agendaOpen').textContent=open;$('agendaDone').textContent=done;$('agendaLabels').textContent=used.size;
    $('agendaList').innerHTML=list.length?list.map(taskRow).join(''):`<div class="agenda-empty"><div class="empty-icon">☼</div><strong>${searchQuery||activeLabel!=='all'||activePriority!=='all'?'No matching tasks':'A little space to breathe'}</strong><span>${searchQuery||activeLabel!=='all'||activePriority!=='all'?'Try changing your search or filters.':'No tasks planned for this day yet. Add one when you are ready.'}</span></div>`;
    $('agendaFooterText').textContent=all.length?`${done} of ${all.length} completed`:'Your day is still open.';
  }
  function render() {
    updateStats();renderLabelOptions();updatePeriodHeading();
    if(currentView==='month')renderMonth();if(currentView==='week')renderWeek();if(currentView==='day')renderDay();if(currentView==='year')renderYear();
    renderAgenda();
    document.querySelectorAll('.view-switch [data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===currentView));document.querySelectorAll('.sidebar .side-link[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));
    $('labelFilter').value=activeLabel;$('priorityFilter').value=activePriority;$('statusFilter').value=activeStatus;
    $('notificationDot').style.display=settings.dailyReminder&&(!('Notification' in window)||Notification.permission!=='granted')?'block':'none';
  }
  function switchView(view) { currentView=view;activeFocus='all';render(); }
  function navigate(direction) {
    if(currentView==='month')cursorDate=new Date(cursorDate.getFullYear(),cursorDate.getMonth()+direction,1,12);
    else if(currentView==='week')cursorDate=addDays(cursorDate,direction*7);
    else if(currentView==='day'){selectedDate=dateKey(addDays(parseDate(selectedDate),direction));cursorDate=parseDate(selectedDate);}
    else cursorDate=new Date(cursorDate.getFullYear()+direction,0,1,12);
    if(currentView!=='day'&&currentView!=='year') selectedDate=dateKey(cursorDate);
    if(currentView==='year')selectedDate=`${cursorDate.getFullYear()}-01-01`;
    render();
  }
  function selectDate(key) { selectedDate=key;cursorDate=parseDate(key);if(currentView==='year')currentView='month';render(); }
  function openTaskModal(id=null, date=selectedDate) {
    const t=id?tasks.find(x=>x.id===id):null;$('taskForm').reset();$('taskId').value=t?.id||'';$('taskModalTitle').textContent=t?'Edit task':'Create a task';
    $('taskTitle').value=t?.title||'';$('taskDate').value=t?.date||date;$('taskLabel').value=t?.label&&labels.some(l=>l.name===t.label)?t.label:labels[0]?.name||'Personal';$('taskStart').value=t?.startTime||'';$('taskEnd').value=t?.endTime||'';$('taskPriority').value=t?.priority||'medium';$('taskRepeat').value=t?.repeat||'none';$('taskReminder').value=t?.reminderAt||'';$('taskTags').value=(t?.tags||[]).join(', ');$('taskNotes').value=t?.notes||'';
    $('taskModal').hidden=false;setTimeout(()=>$('taskTitle').focus(),80);
  }
  function closeModal(id) { $(id).hidden=true; }
  async function saveTask(e) {
    e.preventDefault();const id=$('taskId').value||uid();const old=tasks.find(t=>t.id===id);const title=$('taskTitle').value.trim();if(!title)return;
    const reminder=$('taskReminder').value;
    const item={id,title,date:$('taskDate').value,label:$('taskLabel').value,priority:$('taskPriority').value,startTime:$('taskStart').value,endTime:$('taskEnd').value,repeat:$('taskRepeat').value,reminderAt:reminder,reminderSentAt:old?.reminderAt===reminder?(old?.reminderSentAt||''):'',tags:$('taskTags').value.split(',').map(s=>s.trim()).filter(Boolean),notes:$('taskNotes').value.trim(),done:old?.done||false,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(!item.date){toast('Choose a task date');return;}if(item.endTime&&item.startTime&&item.endTime<item.startTime){toast('End time should be after start time');return;}
    try{await dbPut(item);tasks=tasks.filter(t=>t.id!==id);tasks.push(item);selectedDate=item.date;cursorDate=parseDate(item.date);closeModal('taskModal');render();setSaveStatus();toast(old?'Task updated':'Task added');}catch(err){console.error(err);toast('Could not save task. Check device storage.');}
  }
  function nextRepeatDate(item) {const d=parseDate(item.date);if(item.repeat==='daily')d.setDate(d.getDate()+1);if(item.repeat==='weekly')d.setDate(d.getDate()+7);if(item.repeat==='monthly'){const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));}if(item.repeat==='yearly')d.setFullYear(d.getFullYear()+1);return dateKey(d);}
  async function toggleTask(id) {
    const t=tasks.find(x=>x.id===id);if(!t)return;const wasDone=t.done;t.done=!wasDone;t.updatedAt=new Date().toISOString();await dbPut(t);
    if(!wasDone&&t.repeat&&t.repeat!=='none') {const next={...t,id:uid(),date:nextRepeatDate(t),done:false,reminderSentAt:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};tasks.push(next);await dbPut(next);toast('Completed · next repeat added');}
    else toast(t.done?'Task completed':'Task reopened');render();
  }
  async function deleteTask(id) {const t=tasks.find(x=>x.id===id);if(!t)return;if(!confirm(`Delete “${t.title}”?`))return;await dbDelete(id);tasks=tasks.filter(x=>x.id!==id);render();toast('Task deleted');}
  async function quickAdd() {const title=$('quickAddInput').value.trim();if(!title)return;const item={id:uid(),title,date:selectedDate,label:labels[0]?.name||'Personal',priority:'medium',startTime:'',endTime:'',repeat:'none',reminderAt:'',reminderSentAt:'',tags:[],notes:'',done:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await dbPut(item);tasks.push(item);$('quickAddInput').value='';render();toast('Quick task added');}
  function openDayModal() {const list=tasksOn(selectedDate,filteredTasks());$('dayModalTitle').textContent=niceDate(selectedDate,{weekday:'long',day:'numeric',month:'long'});$('fullDayList').innerHTML=list.length?list.map(taskRow).join(''):'<div class="full-day-empty">No tasks on this date. Enjoy the open space or add a task.</div>';$('dayModal').hidden=false;}
  function setFocus(focus) {activeFocus=focus;activeLabel='all';activePriority='all';activeStatus=focus==='today'?'all':'open';if(focus==='today'){selectedDate=dateKey(new Date());cursorDate=parseDate(selectedDate);currentView='day';}render();}

  function csvCell(s) { const value=String(s??'');return '"'+value.replace(/"/g,'""')+'"'; }
  function download(content,filename,mime) { const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function exportJson() { const payload={app:'Daymark',schemaVersion:1,exportedAt:new Date().toISOString(),labels,settings,tasks};download(JSON.stringify(payload,null,2),`daymark-backup-${dateKey(new Date())}.json`,'application/json');toast('JSON backup downloaded'); }
  function exportCsv() { const cols=['Title','Date','Start Time','End Time','Label','Priority','Status','Repeat','Tags','Notes'];const rows=tasks.map(t=>[t.title,t.date,t.startTime,t.endTime,t.label,t.priority,t.done?'Completed':'Open',t.repeat,(t.tags||[]).join('; '),t.notes]);download([cols,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'),`daymark-tasks-${dateKey(new Date())}.csv`,'text/csv;charset=utf-8');toast('CSV exported'); }
  function escapeIcs(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
  function toIcsDate(date,time) { return date.replace(/-/g,'')+(time?`T${time.replace(':','')}00`:''); }
  function exportIcs() { const events=tasks.filter(t=>!t.done).map(t=>['BEGIN:VEVENT',`UID:${t.id}@daymark`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,t.startTime?`DTSTART:${toIcsDate(t.date,t.startTime)}`:`DTSTART;VALUE=DATE:${t.date.replace(/-/g,'')}`,t.endTime?`DTEND:${toIcsDate(t.date,t.endTime)}`:`DTEND;VALUE=DATE:${dateKey(addDays(parseDate(t.date),1)).replace(/-/g,'')}`,t.repeat&&t.repeat!=='none'?`RRULE:FREQ=${({daily:'DAILY',weekly:'WEEKLY',monthly:'MONTHLY',yearly:'YEARLY'})[t.repeat]}`:'',`SUMMARY:${escapeIcs(t.title)}`,`DESCRIPTION:${escapeIcs([t.label,t.priority,t.notes].filter(Boolean).join(' · '))}`,'END:VEVENT'].filter(Boolean).join('\r\n'));download(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Daymark//Calendar Planner//EN','CALSCALE:GREGORIAN',...events,'END:VCALENDAR'].join('\r\n'),'daymark-calendar.ics','text/calendar;charset=utf-8');toast('Calendar file exported'); }
  function parseCsv(text) { const rows=[];let row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){value+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value='';}else value+=c;}row.push(value);if(row.some(x=>x.trim()))rows.push(row);return rows; }
  async function importCsvFile(file) { const rows=parseCsv(await file.text());if(rows.length<2)throw new Error('CSV has no task rows');const header=rows.shift().map(x=>x.trim().toLowerCase());const col=(...names)=>header.findIndex(h=>names.includes(h));const ti=col('title','task','name','content'),di=col('date','due date','due_date'),li=col('label','list','category'),pi=col('priority'),si=col('status','done'),st=col('start time','start','time'),en=col('end time','end'),no=col('notes','description'),ta=col('tags','tag'),re=col('repeat','recurrence');if(ti<0||di<0)throw new Error('CSV needs Title and Date columns');const added=[];for(const r of rows){const title=(r[ti]||'').trim(),date=(r[di]||'').trim();if(!title||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))continue;const label=(li>=0?r[li]:'')||labels[0]?.name||'Personal';if(!labels.some(l=>l.name===label)){const c=DEFAULT_LABELS[labels.length%DEFAULT_LABELS.length];labels.push({name:label,color:c.color,bg:c.bg});}const status=si>=0?(r[si]||'').toLowerCase():'';const priority=pi>=0&&PRIORITIES.includes((r[pi]||'').toLowerCase())?(r[pi]||'').toLowerCase():'medium';added.push({id:uid(),title,date,label,priority,startTime:st>=0?r[st]||'':'',endTime:en>=0?r[en]||'':'',repeat:re>=0?String(r[re]||'none').toLowerCase():'none',tags:ta>=0?(r[ta]||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean):[],notes:no>=0?r[no]||'':'',done:['done','completed','true','yes'].includes(status),reminderAt:'',reminderSentAt:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}if(!added.length)throw new Error('No valid tasks found. Dates must use YYYY-MM-DD.');if(!confirm(`Import ${added.length} tasks? Existing tasks will be kept.`))return;await dbBulk(added);tasks.push(...added);localStorage.setItem('daymark.labels',JSON.stringify(labels));render();toast(`${added.length} tasks imported`); }
  async function restoreJson(file) { const p=JSON.parse(await file.text());if(!p||p.app!=='Daymark'||!Array.isArray(p.tasks))throw new Error('Not a Daymark backup');if(!confirm(`Restore ${p.tasks.length} tasks? Existing task IDs will be replaced; unrelated tasks will remain.`))return;const incoming=p.tasks.filter(t=>t&&typeof t.id==='string'&&typeof t.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.date));await dbBulk(incoming);const map=new Map(tasks.map(t=>[t.id,t]));incoming.forEach(t=>map.set(t.id,t));tasks=[...map.values()];if(Array.isArray(p.labels)&&p.labels.length){labels=p.labels.filter(l=>l&&typeof l.name==='string').map((l,i)=>({name:l.name,color:/^#[0-9a-fA-F]{6}$/.test(l.color||'')?l.color:DEFAULT_LABELS[i%DEFAULT_LABELS.length].color,bg:/^#[0-9a-fA-F]{6}$/.test(l.bg||'')?l.bg:DEFAULT_LABELS[i%DEFAULT_LABELS.length].bg}));localStorage.setItem('daymark.labels',JSON.stringify(labels));}render();toast(`${incoming.length} tasks restored`); }

  async function showNotification(title,body,tag='daymark') {
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    try { const reg=serviceWorkerRegistration||await navigator.serviceWorker?.ready; if(reg?.showNotification) await reg.showNotification(title,{body,icon:'./icon.svg',badge:'./icon.svg',tag,renotify:false,data:{url:'./'}}); else new Notification(title,{body,tag}); } catch(err) { console.warn('Notification unavailable',err); }
  }
  async function checkReminders() {
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    const now=new Date(),today=dateKey(now);let changed=false;
    for(const t of tasks){if(t.done||!t.reminderAt||t.reminderSentAt)continue;const due=new Date(t.reminderAt);if(!Number.isNaN(due.getTime())&&due<=now){await showNotification('Task reminder',t.title+(t.startTime?` · ${t.startTime}`:''),`task-${t.id}`);t.reminderSentAt=now.toISOString();await dbPut(t);changed=true;}}
    if(settings.dailyReminder&&settings.dailyTime&&now.toTimeString().slice(0,5)>=settings.dailyTime&&settings.lastMorningDate!==today){const todayTasks=tasksOn(today).filter(t=>!t.done);await showNotification('Good morning — your Daymark plan',`${todayTasks.length} task${todayTasks.length===1?'':'s'} planned for today. Take a moment to set your focus.`,'daymark-morning');settings.lastMorningDate=today;saveSettings();}
    if(changed)setSaveStatus();
  }
  async function enableNotifications() {
    if(!('Notification' in window)){toast('This browser does not support notifications');return;}
    const permission=await Notification.requestPermission();$('notificationStatus').textContent=permission==='granted'?'Notifications are enabled. Task reminders and the daily review can appear while supported background delivery is available.':`Notification permission: ${permission}. Change it in the browser's site settings.`;render();if(permission==='granted'){await checkReminders();toast('Notifications enabled');}else toast('Notifications were not enabled');
  }
  function updateNotificationStatus() {
    if(!('Notification' in window))$('notificationStatus').textContent='Notifications are not supported in this browser.';
    else $('notificationStatus').textContent=`Browser permission: ${Notification.permission}. ${settings.dailyReminder?'Daily review is set for '+settings.dailyTime+'.':'Daily review reminder is off.'}`;
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
    $('prevBtn').addEventListener('click',()=>navigate(-1));$('nextBtn').addEventListener('click',()=>navigate(1));$('todayBtn').addEventListener('click',()=>{selectedDate=dateKey(new Date());cursorDate=parseDate(selectedDate);activeFocus='all';render();});
    $('headingAdd').addEventListener('click',()=>openTaskModal());$('addTaskBtn').addEventListener('click',()=>openTaskModal());$('agendaAdd').addEventListener('click',()=>openTaskModal(null,selectedDate));$('taskForm').addEventListener('submit',saveTask);
    $('quickAddSubmit').addEventListener('click',quickAdd);$('quickAddInput').addEventListener('keydown',e=>{if(e.key==='Enter')quickAdd();});$('showDayTasks').addEventListener('click',openDayModal);$('dayModalAdd').addEventListener('click',()=>{closeModal('dayModal');openTaskModal(null,selectedDate);});
    $('searchInput').addEventListener('input',e=>{searchQuery=e.target.value.trim();render();});$('labelFilter').addEventListener('change',e=>{activeLabel=e.target.value;render();});$('priorityFilter').addEventListener('change',e=>{activePriority=e.target.value;render();});$('statusFilter').addEventListener('change',e=>{activeStatus=e.target.value;render();});$('clearFilters').addEventListener('click',()=>{searchQuery='';$('searchInput').value='';activeLabel=activePriority='all';activeStatus='open';activeFocus='all';render();});
    $('calendarHost').addEventListener('click',e=>{const edit=e.target.closest('[data-task-edit]');if(edit){e.stopPropagation();openTaskModal(edit.dataset.taskEdit);return;}const cell=e.target.closest('[data-date]');if(cell){selectDate(cell.dataset.date);return;}const month=e.target.closest('[data-month]');if(month){const m=Number(month.dataset.month);cursorDate=new Date(cursorDate.getFullYear(),m,1,12);selectedDate=dateKey(cursorDate);currentView='month';render();}});
    $('calendarHost').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.month-cell')){e.preventDefault();selectDate(e.target.dataset.date);}});
    document.body.addEventListener('click',e=>{const check=e.target.closest('[data-task-check]');if(check){toggleTask(check.dataset.taskCheck);return;}const edit=e.target.closest('[data-task-edit]');if(edit){openTaskModal(edit.dataset.taskEdit);return;}const del=e.target.closest('[data-task-delete]');if(del){deleteTask(del.dataset.taskDelete);return;}const label=e.target.closest('[data-label]');if(label){activeLabel=activeLabel===label.dataset.label?'all':label.dataset.label;render();return;}const close=e.target.closest('[data-close]');if(close)closeModal(close.dataset.close);});
    $('settingsBtn').addEventListener('click',openSettings);$('profileBtn').addEventListener('click',openSettings);$('notificationBtn').addEventListener('click',openSettings);$('enableNotifications').addEventListener('click',enableNotifications);$('testNotification').addEventListener('click',async()=>{if(!('Notification' in window)){toast('This browser does not support notifications');return;}if(Notification.permission!=='granted'){await enableNotifications();return;}await showNotification('Daymark is ready','Your planner notifications are working.','daymark-test');toast('Test notification sent');});
    $('dailyReminderEnabled').addEventListener('change',e=>{settings.dailyReminder=e.target.checked;saveSettings();updateNotificationStatus();render();});$('dailyReminderTime').addEventListener('change',e=>{settings.dailyTime=e.target.value||'07:00';settings.lastMorningDate='';saveSettings();updateNotificationStatus();});
    $('saveLabels').addEventListener('click',()=>{const names=[...new Set($('labelsInput').value.split(',').map(x=>x.trim()).filter(Boolean))];if(!names.length){toast('Keep at least one label');return;}labels=names.map((name,i)=>{const old=labelFor(name);const fallback=DEFAULT_LABELS[i%DEFAULT_LABELS.length];return {name,color:old.color,bg:old.bg};});localStorage.setItem('daymark.labels',JSON.stringify(labels));render();toast('Labels saved');});
    $('exportJson').addEventListener('click',exportJson);$('exportCsv').addEventListener('click',exportCsv);$('exportIcs').addEventListener('click',exportIcs);$('importJsonBtn').addEventListener('click',()=>$('jsonFile').click());$('importCsvBtn').addEventListener('click',()=>$('csvFile').click());
    $('jsonFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)try{await restoreJson(f);}catch(err){console.error(err);toast(err.message||'Could not restore backup');}finally{e.target.value='';}});
    $('csvFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)try{await importCsvFile(f);}catch(err){console.error(err);toast(err.message||'Could not import CSV');}finally{e.target.value='';}});
    $('todayFocus').addEventListener('click',()=>setFocus('today'));$('upcomingFocus').addEventListener('click',()=>setFocus('upcoming'));$('overdueFocus').addEventListener('click',()=>setFocus('overdue'));
    $('mobileMenu').addEventListener('click',()=>$('sidebar').classList.toggle('open'));$('calendarMore').addEventListener('click',()=>toast('Tip: use the filters above to focus the calendar.'));
    document.querySelectorAll('.modal-backdrop').forEach(back=>back.addEventListener('click',e=>{if(e.target===back)back.hidden=true;}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop').forEach(m=>m.hidden=true);if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('searchInput').focus();}});
  }
  function openSettings() { $('dailyReminderEnabled').checked=!!settings.dailyReminder;$('dailyReminderTime').value=settings.dailyTime||'07:00';$('labelsInput').value=labels.map(l=>l.name).join(', ');updateNotificationStatus();$('settingsModal').hidden=false; }
  async function init() {
    bindEvents();
    try { tasks=await dbAll(); } catch(err) { console.error(err);toast('Local database is not available. Use a supported browser.'); }
    if('serviceWorker' in navigator&&location.protocol!=='file:') { try { serviceWorkerRegistration=await navigator.serviceWorker.register('./sw.js'); } catch(err) { console.warn('Service worker registration failed',err); } }
    render();
    checkReminders();setInterval(checkReminders,30000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders();});
    if(!tasks.length)setSaveStatus('Ready · Add your first task');
  }
  init();
})();
