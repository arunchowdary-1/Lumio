/* ═══════════════════════════════════════════════════════
   StudyAI — Frontend JavaScript
   All UI logic, API communication, Pomodoro, dynamic rendering
═══════════════════════════════════════════════════════ */

'use strict';

// ─── Constants ────────────────────────────────────────
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SHORT_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TODAY_NAME = new Date().toLocaleDateString('en-US', {weekday:'long'});
const TODAY_IDX  = DAYS.indexOf(TODAY_NAME);

const GLYPHS  = ["∑","⚛","✦","∫","⚗","🌿","🌐","♫"];
const TIPS = [
  "Studying in 45-min blocks with 10-min breaks boosts retention by ~30%.",
  "Review notes within 24 hours to lock memory into long-term storage.",
  "High-priority subjects get your best morning focus hours.",
  "Spaced repetition is 2× more effective than massed practice.",
  "Sleeping after studying consolidates memory significantly.",
  "Interleaving subjects (switching topics) improves exam performance.",
  "Active recall beats passive re-reading every time.",
  "Teach what you learn — the Feynman technique cements understanding.",
];

// ─── State ─────────────────────────────────────────────
let state = {
  subjects: [],
  timetable: {},
  todaySessions: [],
  progressData: null,
  hoursPerDay: 5,
};

// ─── Pomodoro ──────────────────────────────────────────
let pomoTimer  = null;
let pomoSecs   = 25 * 60;
let pomoRunning = false;
let pomoBreak  = false;

function startPomo() {
  if (pomoRunning) return;
  pomoRunning = true;
  document.getElementById('pomoStatus').textContent = pomoBreak ? '☕ Break time!' : '🎯 Focus session';
  pomoTimer = setInterval(() => {
    pomoSecs--;
    if (pomoSecs <= 0) {
      clearInterval(pomoTimer);
      pomoRunning = false;
      pomoBreak   = !pomoBreak;
      pomoSecs    = pomoBreak ? 5 * 60 : 25 * 60;
      updatePomoDisplay();
      showToast(pomoBreak ? '✅ Session done! Take a 5-min break.' : '▶ Break over! Time to focus.', 'success');
      return;
    }
    updatePomoDisplay();
  }, 1000);
}

function resetPomo() {
  clearInterval(pomoTimer);
  pomoRunning = false;
  pomoBreak   = false;
  pomoSecs    = 25 * 60;
  updatePomoDisplay();
  document.getElementById('pomoStatus').textContent = 'Focus session';
}

function updatePomoDisplay() {
  const m = String(Math.floor(pomoSecs / 60)).padStart(2, '0');
  const s = String(pomoSecs % 60).padStart(2, '0');
  document.getElementById('pomoDisplay').textContent = `${m}:${s}`;
}

// ─── Tabs ──────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'timetable') loadTimetable();
    if (btn.dataset.tab === 'today')     loadToday();
    if (btn.dataset.tab === 'progress')  loadProgress();
  });
});

// ─── API helpers ───────────────────────────────────────
async function api(url, method='GET', body=null) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  return res.json();
}

// ─── Toast ─────────────────────────────────────────────
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3200);
}

// ─── Helpers ───────────────────────────────────────────
function priorityLabel(p) { return p===3?'High':p===2?'Medium':'Low'; }
function priorityColor(p) { return p===3?'#FF6B6B':p===2?'#FFE66D':'#4ECDC4'; }
function daysLeft(dl) {
  const diff = Math.ceil((new Date(dl) - new Date()) / 86400000);
  return diff;
}
function tagHTML(color, label) {
  return `<span class="tag" style="background:${color}22;color:${color};border-color:${color}44">${label}</span>`;
}

// ─── SETUP TAB ────────────────────────────────────────

function updateHoursDisplay(val) {
  document.getElementById('hoursBadge').textContent = val;
  const hints = ['🌙 Light schedule','🌙 Light schedule','🌙 Light schedule',
                 '⚡ Balanced load','⚡ Balanced load','⚡ Balanced load',
                 '⚡ Balanced load','🔥 Intensive grind','🔥 Intensive grind',
                 '🔥 Intensive grind','🔥 Intensive grind','🔥 Intensive grind'];
  document.getElementById('sliderHint').textContent = hints[val-1] || '⚡ Balanced load';
  state.hoursPerDay = +val;
}

async function saveHours() {
  await api('/api/settings','POST',{hours_per_day: state.hoursPerDay});
  showToast('✓ Daily hours saved!');
}

async function loadSubjects() {
  state.subjects = await api('/api/subjects');
  renderSubjectList();
}

function renderSubjectList() {
  const el = document.getElementById('subjectList');
  if (!state.subjects.length) {
    el.innerHTML = '<div class="empty-state">No subjects yet. Add your first one →</div>';
    return;
  }
  el.innerHTML = state.subjects.map((s, i) => {
    const glyph = GLYPHS[i % GLYPHS.length];
    const dl    = daysLeft(s.deadline);
    const urgentTag = dl <= 7 ? tagHTML('#FF6B6B', `🔥 ${dl}d left`) : '';
    return `
    <div class="subject-card" style="border-left-color:${s.color};animation:fadeUp .3s ease ${i*0.06}s both">
      <div class="subject-icon" style="background:${s.color}22;color:${s.color}">${glyph}</div>
      <div class="subject-info">
        <div class="subject-name">
          ${s.name}
          ${tagHTML(priorityColor(s.priority), priorityLabel(s.priority))}
          ${urgentTag}
        </div>
        <div class="subject-meta">
          <span>⏱ ${s.total_hours}h total</span>
          <span>✓ ${s.completed_hours}h done</span>
          <span>📅 ${s.deadline}</span>
          <span>${dl} days left</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${s.pct}%;background:${s.color}"></div>
        </div>
      </div>
      <button class="btn-delete" onclick="deleteSubject(${s.id})">✕</button>
    </div>`;
  }).join('');
}

async function addSubject() {
  const name     = document.getElementById('inp-name').value.trim();
  const hours    = document.getElementById('inp-hours').value;
  const priority = document.getElementById('inp-priority').value;
  const deadline = document.getElementById('inp-deadline').value;

  if (!name)     return showToast('Please enter a subject name', 'error');
  if (!deadline) return showToast('Please select a deadline', 'error');
  if (+hours < 1) return showToast('Hours must be at least 1', 'error');

  await api('/api/subjects','POST',{name, total_hours:+hours, priority:+priority, deadline});
  document.getElementById('inp-name').value    = '';
  document.getElementById('inp-deadline').value= '';
  showToast(`✓ ${name} added!`);
  loadSubjects();
}

async function deleteSubject(id) {
  await api(`/api/subjects/${id}`, 'DELETE');
  showToast('Subject removed', 'error');
  loadSubjects();
}

// ─── GENERATE PLAN ────────────────────────────────────

async function generatePlan() {
  if (!state.subjects.length) {
    await loadSubjects();
    if (!state.subjects.length) return showToast('Add subjects first!', 'error');
  }

  const btn    = document.getElementById('generateBtn');
  const txt    = document.getElementById('genBtnText');
  const spinner= document.getElementById('genSpinner');
  const wrap   = document.getElementById('genProgressWrap');
  const fill   = document.getElementById('genProgressFill');
  const step   = document.getElementById('genStepText');

  btn.disabled = true;
  spinner.classList.remove('hidden');
  wrap.classList.remove('hidden');

  const steps = [
    [15,  'Analyzing deadlines & priorities…'],
    [35,  'Applying spaced repetition logic…'],
    [55,  'Balancing daily cognitive load…'],
    [75,  'Optimizing session block sizes…'],
    [90,  'Saving to database…'],
  ];

  for (const [pct, msg] of steps) {
    await sleep(380);
    fill.style.width = pct + '%';
    step.textContent = msg;
    txt.textContent  = msg;
  }

  const res = await api('/api/generate_plan','POST');

  await sleep(300);
  fill.style.width = '100%';
  step.textContent = '✓ Plan generated!';
  await sleep(400);

  btn.disabled = false;
  spinner.classList.add('hidden');
  wrap.classList.add('hidden');
  txt.textContent = '✦ Generate AI Study Plan';
  fill.style.width = '0%';

  if (res.error) return showToast(res.error, 'error');

  showToast('✓ AI Study Plan Generated!', 'success');
  loadTimetable();
  loadProgress();

  // Switch to timetable
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelector('[data-tab="timetable"]').classList.add('active');
  document.getElementById('tab-timetable').classList.add('active');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── TIMETABLE TAB ────────────────────────────────────

async function loadTimetable() {
  const [timetable, progress] = await Promise.all([
    api('/api/timetable'),
    api('/api/progress'),
  ]);
  state.timetable    = timetable;
  state.progressData = progress;

  renderTimetable();
  renderPriorityList(progress);
  updateHeaderScore(progress.score);
}

function renderTimetable() {
  const grid = document.getElementById('timetableGrid');
  const hasSessions = DAYS.some(d => state.timetable[d]?.length > 0);

  if (!hasSessions) {
    grid.innerHTML = '<div class="no-plan-msg">Generate your plan from the Setup tab first.</div>';
    return;
  }

  let missedCount = 0;

  grid.innerHTML = DAYS.map((day, di) => {
    const sessions = state.timetable[day] || [];
    const isToday  = di === TODAY_IDX;

    const sessionBlocks = sessions.length ? sessions.map(s => {
      if (s.status === 'missed') missedCount++;
      const statusClass = s.status === 'done' ? 'status-done' : s.status === 'missed' ? 'status-missed' : '';
      const statusLabel = s.status === 'done'
        ? `<span class="session-status-label" style="color:var(--green)">✓ Done</span>`
        : s.status === 'missed'
        ? `<span class="session-status-label" style="color:var(--red)">✕ Missed</span>`
        : `<span class="session-status-label" style="color:${s.color}">${s.hours}h</span>`;

      return `
      <div class="session-block ${statusClass}" style="border-left:3px solid ${s.color}20">
        ${statusLabel}
        <div class="session-name">${s.subject_name}</div>
        <div class="session-hours">${s.hours}h · ${day.slice(0,3)}</div>
        <div class="session-btns">
          <button class="session-btn done-btn ${s.status==='done'?'active':''}"
            onclick="markSession(${s.id},'done')">✓ Done</button>
          <button class="session-btn miss-btn ${s.status==='missed'?'active':''}"
            onclick="markSession(${s.id},'missed')">✕</button>
        </div>
      </div>`;
    }).join('') : `<div class="rest-day">☁ Rest day</div>`;

    return `
    <div class="day-col">
      <div class="day-header ${isToday ? 'today' : ''}">
        ${isToday ? '<span class="today-dot"></span>' : ''}
        ${SHORT_DAYS[di]}
      </div>
      ${sessionBlocks}
    </div>`;
  }).join('');

  // Show/hide adjust banner
  const banner = document.getElementById('adjustBanner');
  if (missedCount > 0) banner.classList.remove('hidden');
  else banner.classList.add('hidden');
}

async function markSession(id, status) {
  // Toggle: if already that status, revert to pending
  const session = findSession(id);
  const newStatus = session && session.status === status ? 'pending' : status;
  await api(`/api/sessions/${id}/status`, 'POST', {status: newStatus});
  await loadTimetable();
  loadProgress();
  if (document.getElementById('tab-today').classList.contains('active')) loadToday();
}

function findSession(id) {
  for (const day of DAYS) {
    const found = (state.timetable[day] || []).find(s => s.id === id);
    if (found) return found;
  }
  return null;
}

function renderPriorityList(progress) {
  const card = document.getElementById('priorityCard');
  const list = document.getElementById('priorityList');
  if (!progress.subjects?.length) { card.style.display='none'; return; }
  card.style.display = 'block';

  // Sort by priority_order
  const ordered = [...progress.subjects].sort((a,b) => {
    const ia = progress.priority_order.indexOf(a.id);
    const ib = progress.priority_order.indexOf(b.id);
    return ia - ib;
  });

  list.innerHTML = ordered.map((s, i) => `
    <div class="priority-item" style="animation:fadeUp .3s ease ${i*0.07}s both">
      <div class="priority-rank">${i+1}</div>
      <div class="priority-dot" style="background:${s.color};box-shadow:0 0 6px ${s.color}"></div>
      <div class="priority-info">
        <div class="priority-name">
          ${s.name}
          ${tagHTML(priorityColor(s.priority), priorityLabel(s.priority))}
          ${s.days_left<=7?tagHTML('#FF6B6B',`⚠ ${s.days_left}d`):''}
        </div>
        <div class="priority-meta">${s.completed_hours}h / ${s.total_hours}h · ${s.days_left} days left</div>
        <div class="priority-bar-wrap">
          <div class="bar-track" style="height:4px;margin-top:4px">
            <div class="bar-fill" style="width:${s.pct}%;background:${s.color}"></div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── TODAY TAB ────────────────────────────────────────

async function loadToday() {
  document.getElementById('todayDate').textContent =
    new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

  const [sessions, timetable] = await Promise.all([
    api('/api/today'),
    api('/api/timetable'),
  ]);
  state.todaySessions = sessions;
  state.timetable     = timetable;

  renderToday();
  renderMissedList();
}

function renderToday() {
  const list = document.getElementById('todayList');
  const load = document.getElementById('todayLoad');
  const sesEl= document.getElementById('todaySessions');

  if (!state.todaySessions.length) {
    list.innerHTML  = '<div class="no-plan-msg">No sessions today — rest day! 🌴<br>Or generate a plan from Setup.</div>';
    load.textContent = '0h';
    sesEl.textContent= '0 sessions';
    return;
  }

  const totalH = state.todaySessions.reduce((s,x)=>s+x.hours,0);
  load.textContent = `${totalH}h`;
  sesEl.textContent= `${state.todaySessions.length} session${state.todaySessions.length!==1?'s':''}`;

  const missed = state.todaySessions.some(s=>s.status==='missed');
  document.getElementById('adjustBtn').classList.toggle('hidden', !missed);

  list.innerHTML = state.todaySessions.map((s, i) => {
    const pomoBlocks = s.hours===1?'2×25min':s.hours<=2?'4×25min':'6×25min';
    return `
    <div class="today-card ${s.status}" style="border-left-color:${s.color};animation:fadeUp .3s ease ${i*0.08}s both">
      <div class="today-card-top">
        <div class="today-icon" style="background:${s.color}20;color:${s.color}">${GLYPHS[i%GLYPHS.length]}</div>
        <div>
          <div class="today-name">${s.subject_name}</div>
          <div class="today-meta">
            ⏱ ${s.hours} hours &nbsp;·&nbsp; 📅 ${s.deadline} &nbsp;·&nbsp; ${daysLeft(s.deadline)} days left
            &nbsp;·&nbsp; ${tagHTML(priorityColor(s.priority), priorityLabel(s.priority))}
          </div>
        </div>
        <div class="today-actions">
          <button class="btn-done ${s.status==='done'?'active':''}"
            onclick="markSessionToday(${s.id},'done')">
            ${s.status==='done'?'✓ Done!':'Mark Done'}
          </button>
          <button class="btn-miss ${s.status==='missed'?'active':''}"
            onclick="markSessionToday(${s.id},'missed')">Missed</button>
        </div>
      </div>
      <div class="pomo-hint">🍅 Recommended: ${pomoBlocks} Pomodoro sessions with 5-min breaks</div>
    </div>`;
  }).join('');
}

async function markSessionToday(id, status) {
  const session   = state.todaySessions.find(s=>s.id===id);
  const newStatus = session && session.status===status ? 'pending' : status;
  await api(`/api/sessions/${id}/status`,'POST',{status:newStatus});
  loadToday();
  updateHeaderScore();
}

function renderMissedList() {
  const el = document.getElementById('missedList');
  const allSessions = DAYS.flatMap(d => state.timetable[d]||[]);
  const missed = allSessions.filter(s=>s.status==='missed');
  const adjBtn = document.getElementById('adjustBtn');

  if (!missed.length) {
    el.innerHTML = '<p class="no-missed">✓ No missed sessions!</p>';
    adjBtn.classList.add('hidden');
    return;
  }
  adjBtn.classList.remove('hidden');
  el.innerHTML = missed.map(s=>`
    <div class="missed-item">
      <div class="missed-dot"></div>
      <span>${s.subject_name} — ${s.day_name?.slice(0,3)||'?'}</span>
    </div>
  `).join('');
}

// ─── ADJUST MISSED ────────────────────────────────────

async function adjustMissed() {
  const res = await api('/api/adjust_missed','POST');
  if (res.ok) {
    showToast(`✓ Schedule adjusted for ${res.adjusted} missed subject(s)!`, 'success');
    await loadTimetable();
    loadToday();
  } else {
    showToast(res.message||'No missed sessions', 'error');
  }
}

// ─── PROGRESS TAB ─────────────────────────────────────

async function loadProgress() {
  const [progress, summary] = await Promise.all([
    api('/api/progress'),
    api('/api/weekly_summary'),
  ]);
  state.progressData = progress;
  renderGauge(progress.score);
  renderProgressStats(progress);
  renderSubjectBreakdown(progress.subjects||[]);
  renderWeeklySummary(summary);
  updateHeaderScore(progress.score);
}

function updateHeaderScore(score) {
  if (score === undefined) return;
  const dot   = document.getElementById('scoreDot');
  const val   = document.getElementById('headerScore');
  val.textContent = score + '%';
  const color = score>=75?'#34D399':score>=45?'#FFE66D':'#FF6B6B';
  dot.style.background  = color;
  dot.style.boxShadow   = `0 0 6px ${color}`;
}

function renderGauge(score) {
  const fill  = document.getElementById('gaugeFill');
  const pctEl = document.getElementById('gaugePct');
  const gradeEl=document.getElementById('gaugeGrade');
  const msgEl = document.getElementById('gaugeMsg');

  const circumference = 2 * Math.PI * 50; // r=50
  const dash = (score / 100) * circumference;
  fill.style.strokeDasharray = `${dash} ${circumference}`;

  const color = score>=75?'#34D399':score>=45?'#FFE66D':'#FF6B6B';
  fill.style.stroke = color;
  pctEl.textContent = score + '%';
  pctEl.style.color = color;

  const grade = score>=90?'S':score>=75?'A':score>=60?'B':score>=45?'C':'D';
  gradeEl.textContent = 'Grade ' + grade;
  gradeEl.style.color = color;

  msgEl.textContent = score>=75 ? '🔥 You\'re crushing it! Keep the momentum.'
    : score>=45 ? '⚡ Good start — tackle missed sessions.'
    : '💪 Let\'s pick up the pace. You got this!';
}

function renderProgressStats(p) {
  document.getElementById('statTotal').textContent       = p.total_hours + 'h';
  document.getElementById('statDone').textContent        = p.completed_hours + 'h';
  document.getElementById('statMissed').textContent      = p.missed_count;
  document.getElementById('statDoneSessions').textContent= p.done_count;
}

function renderSubjectBreakdown(subjects) {
  const el = document.getElementById('subjectBreakdown');
  if (!subjects.length) { el.innerHTML='<div class="empty-state">No subjects yet.</div>'; return; }

  el.innerHTML = subjects.map((s, i) => {
    const tight = s.days_left <= 5 && (s.total_hours - s.completed_hours) > 0;
    return `
    <div class="breakdown-item" style="animation:fadeUp .3s ease ${i*0.07}s both">
      <div class="breakdown-header">
        <div class="breakdown-name" style="color:${s.color}">
          ${GLYPHS[i%GLYPHS.length]} <span style="color:var(--text)">${s.name}</span>
          ${tagHTML(s.color, s.pct+'%')}
          ${tagHTML(priorityColor(s.priority), priorityLabel(s.priority))}
        </div>
        <div class="breakdown-nums">${s.completed_hours}h / ${s.total_hours}h &nbsp;·&nbsp; ${s.total_hours-s.completed_hours}h left</div>
      </div>
      <div class="breakdown-bar">
        <div class="breakdown-bar-fill" style="width:${s.pct}%;background:linear-gradient(90deg,${s.color}88,${s.color})"></div>
      </div>
      <div class="breakdown-hint">
        <span>📅 ${s.days_left} days until exam</span>
        ${s.hours_per_day_needed > 0 ? `<span>⏱ Need ${s.hours_per_day_needed}h/day to finish on time</span>` : '<span style="color:var(--green)">✓ On track</span>'}
        ${tight ? '<span class="tight-warning">⚠ Tight deadline!</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function renderWeeklySummary(summary) {
  const el = document.getElementById('weeklySummary');
  el.innerHTML = DAYS.map((day, di) => {
    const s      = summary[day] || {total:0,done:0,missed:0,pending:0};
    const isToday= di === TODAY_IDX;
    return `
    <div class="day-summary ${isToday?'today-col':''}">
      <div class="ds-name" style="${isToday?'color:var(--teal)':''}">${SHORT_DAYS[di]}</div>
      <div class="ds-hours" style="${isToday?'color:var(--teal)':''}">${s.total}h</div>
      <div class="ds-done">✓ ${s.done} done</div>
      ${s.missed>0?`<div class="ds-miss">✕ ${s.missed} missed</div>`:''}
    </div>`;
  }).join('');
}

// ─── INIT ──────────────────────────────────────────────
async function init() {
  // Set random tip
  document.getElementById('aiTip').textContent = TIPS[Math.floor(Math.random()*TIPS.length)];

  // Set today's date on today tab
  document.getElementById('todayDate').textContent =
    new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

  // Load settings
  const settings = await api('/api/settings');
  if (settings.hours_per_day) {
    const h = parseFloat(settings.hours_per_day);
    state.hoursPerDay = h;
    document.getElementById('hoursSlider').value = h;
    updateHoursDisplay(h);
  }

  // Load subjects
  await loadSubjects();

  // Update header score
  const progress = await api('/api/progress');
  updateHeaderScore(progress.score);
}

init();
