// SLF — Self Leveling Fitness
// Everything runs in the browser. Progress is kept in localStorage; there is
// no server and no AI. Stats, XP, level and streaks are recomputed from the
// saved days every time, so undoing a log entry also undoes its rewards.

import { QUESTIONS } from './questions.js';

// Bump on every release and tag the commit to match (git tag v1.0.0).
const VERSION = '1.0.0';

/* ================= Dates (local time, never UTC) ================= */

// ?today=YYYY-MM-DD and ?hour=H pretend to be another day or hour. They are
// only for testing the day rollover, penalty and reminder in a browser.
const params = new URLSearchParams(location.search);
const TEST_TODAY = /^\d{4}-\d{2}-\d{2}$/.test(params.get('today') || '') ? params.get('today') : null;
const TEST_HOUR = params.has('hour') ? Number(params.get('hour')) : null;

function pad(n) { return String(n).padStart(2, '0'); }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
function weekday(k) { return parseKey(k).getDay(); }

function nowDate() {
  const d = new Date();
  if (TEST_TODAY) {
    const t = parseKey(TEST_TODAY);
    t.setHours(d.getHours(), d.getMinutes());
    d.setTime(t.getTime());
  }
  if (TEST_HOUR !== null && isFinite(TEST_HOUR)) d.setHours(TEST_HOUR);
  return d;
}
function todayKey() { return keyOf(nowDate()); }

function prettyDate(k) {
  return parseKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/* ================= Rules ================= */

const BASE_EXERCISES = [
  { id: 'pushups', name: 'Push-ups', unit: 'reps', stat: 'STR' },
  { id: 'situps', name: 'Sit-ups', unit: 'reps', stat: 'STR' },
  { id: 'squats', name: 'Squats', unit: 'reps', stat: 'STR' },
  { id: 'run', name: 'Run', unit: 'km', stat: 'AGI' },
];

const UNIT_LABEL = { reps: 'reps', km: 'km', min: 'min' };

const ACTIVITY = [
  { v: 1.2, label: 'Sedentary — little or no exercise' },
  { v: 1.375, label: 'Light — exercise 1-3 days a week' },
  { v: 1.55, label: 'Moderate — exercise 3-5 days a week' },
  { v: 1.725, label: 'Very active — exercise 6-7 days a week' },
  { v: 1.9, label: 'Extra active — physical job plus training' },
];

const GOALS = {
  lose: { label: 'Lose weight', kcal: -500, prot: 2.0 },
  maintain: { label: 'Maintain', kcal: 0, prot: 1.6 },
  muscle: { label: 'Build muscle', kcal: 250, prot: 2.0 },
  gain: { label: 'Gain weight', kcal: 500, prot: 1.6 },
};

const STAT_START = 10;
const STAT_GAIN = 5;
const XP_PART = 20;        // STR, AGI or VIT part done
const XP_PER_CORRECT = 4;  // quiz, so 5/5 = 20
const XP_CLEAR = 20;       // whole quest cleared
const XP_PENALTY_CLEAR = 20;

function xpNeeded(level) { return 100 + 20 * (level - 1); }

function levelInfo(xp) {
  let level = 1;
  let rest = xp;
  while (rest >= xpNeeded(level)) { rest -= xpNeeded(level); level++; }
  return { level, into: rest, need: xpNeeded(level) };
}

function rankOf(level) {
  if (level >= 50) return 'S';
  if (level >= 40) return 'A';
  if (level >= 30) return 'B';
  if (level >= 20) return 'C';
  if (level >= 10) return 'D';
  return 'E';
}

// 10 reps / 1 km at level 1, 100 reps / 10 km at level 50.
function repsTarget(level) { return Math.round(10 + (Math.min(level, 50) - 1) * 90 / 49); }
function kmTarget(level) { return Math.round((1 + (Math.min(level, 50) - 1) * 9 / 49) * 2) / 2; }

function penaltyUp(value, unit) {
  const v = value * 1.5;
  return unit === 'km' ? Math.ceil(v * 2) / 2 : Math.ceil(v);
}

const TITLES = [
  { id: 'first', name: 'First Step', desc: 'Clear your first Daily Quest.', test: d => d.quests >= 1 },
  { id: 'streak3', name: 'Three-Day Flame', desc: 'Reach a 3-day streak.', test: d => d.best >= 3 },
  { id: 'streak7', name: 'Weekly Warrior', desc: 'Reach a 7-day streak.', test: d => d.best >= 7 },
  { id: 'streak30', name: 'Iron Will', desc: 'Reach a 30-day streak.', test: d => d.best >= 30 },
  { id: 'lv10', name: 'Awakened', desc: 'Reach level 10.', test: d => d.level >= 10 },
  { id: 'lv25', name: 'Veteran', desc: 'Reach level 25.', test: d => d.level >= 25 },
  { id: 'lv50', name: 'Transcendent', desc: 'Reach level 50.', test: d => d.level >= 50 },
  { id: 'rankD', name: 'D-Rank', desc: 'Rank up to D (level 10).', test: d => d.level >= 10 },
  { id: 'rankC', name: 'C-Rank', desc: 'Rank up to C (level 20).', test: d => d.level >= 20 },
  { id: 'rankB', name: 'B-Rank', desc: 'Rank up to B (level 30).', test: d => d.level >= 30 },
  { id: 'rankA', name: 'A-Rank', desc: 'Rank up to A (level 40).', test: d => d.level >= 40 },
  { id: 'rankS', name: 'S-Rank', desc: 'Rank up to S (level 50).', test: d => d.level >= 50 },
  { id: 'km100', name: '100 km Runner', desc: 'Run 100 km in total.', test: d => d.totals.run >= 100 },
  { id: 'push10k', name: 'Ten Thousand Push-ups', desc: 'Do 10,000 push-ups in total.', test: d => d.totals.pushups >= 10000 },
  { id: 'perfect1', name: 'Perfect Mind', desc: 'Score 5/5 on a daily quiz.', test: d => d.perfect >= 1 },
  { id: 'perfect7', name: 'Genius', desc: 'Score 5/5 on 7 quiz days.', test: d => d.perfect >= 7 },
];
[
  ['STR', ['Brawler', 'Powerhouse', 'Titan']],
  ['AGI', ['Swift', 'Fleet-Footed', 'Lightning']],
  ['VIT', ['Healthy Body', 'Iron Body', 'Unbreakable']],
  ['INT', ['Student', 'Scholar', 'Sage']],
].forEach(([stat, names]) => {
  [50, 100, 250].forEach((n, i) => {
    TITLES.push({ id: stat + n, name: names[i], desc: stat + ' reaches ' + n + '.', test: d => d.stats[stat] >= n });
  });
});

/* ================= Quiz bank ================= */

// Each question: [question, correct answer, wrong, wrong, wrong, explanation].
// A question's id is its position in the list, so only ever add new
// questions at the end.
const QUESTION_BY_ID = {};
QUESTIONS.forEach((q, i) => { QUESTION_BY_ID['q' + i] = q; });

/* ================= State ================= */

const STORE_KEY = 'slf.v1';

function freshState() {
  return {
    version: 1,
    profile: null,
    settings: {
      requireBoth: true,
      rest: [],
      sound: true,
      quizMode: 'next',
      reminderHour: null,
      units: 'metric',
    },
    body: {
      sex: 'male',
      age: 25,
      heightCm: 170,
      weightKg: 70,
      activity: 1.375,
      goal: 'maintain',
      calTarget: null,
      protTarget: null,
    },
    custom: [],
    days: {},
    titles: {},
    activeTitle: null,
    quizSeen: [],
    lastFinalized: null,
    arrivedShown: null,
  };
}

let state = freshState();
let saveFailed = false;

function mergeState(saved) {
  const base = freshState();
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved.settings || {}) },
    body: { ...base.body, ...(saved.body || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state = mergeState(JSON.parse(raw));
  } catch (e) {
    state = freshState();
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    saveFailed = false;
  } catch (e) {
    saveFailed = true;
  }
}

/* ================= Calories ================= */

function bmr(b) {
  const base = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age;
  return b.sex === 'female' ? base - 161 : base + 5;
}
function maintenance(b) { return Math.round(bmr(b) * b.activity); }
function calorieFloor(b) { return b.sex === 'female' ? 1200 : 1500; }

function suggestedTargets(b) {
  const goal = GOALS[b.goal] || GOALS.maintain;
  const raw = maintenance(b) + goal.kcal;
  const floor = calorieFloor(b);
  const kcal = Math.round(Math.max(raw, floor) / 10) * 10;
  const prot = Math.round(b.weightKg * goal.prot / 5) * 5;
  return { kcal, prot, floored: raw < floor };
}

function currentTargets(b) {
  const s = suggestedTargets(b);
  return {
    kcal: b.calTarget != null ? b.calTarget : s.kcal,
    prot: b.protTarget != null ? b.protTarget : s.prot,
  };
}

/* ================= Days ================= */

function isRestWeekday(k) { return state.settings.rest.includes(weekday(k)); }

function sum(list, f) { return list.reduce((a, x) => a + (f(x) || 0), 0); }
function round1(x) { return Math.round(x * 10) / 10; }

function dayTargets(day) {
  const level = day.level || 1;
  const list = BASE_EXERCISES.map(e => ({
    ...e,
    target: e.unit === 'km' ? kmTarget(level) : repsTarget(level),
  }));
  (day.custom || []).forEach(c => list.push({ ...c }));
  if (day.penalty) list.forEach(e => { e.target = penaltyUp(e.target, e.unit); });
  return list;
}

// Works out what a day achieved. Past days use the targets and rule saved
// when the day was closed; today uses the current settings.
function evalDay(day) {
  const targets = dayTargets(day);
  const done = day.done || {};
  const part = stat => {
    const list = targets.filter(t => t.stat === stat);
    return list.length > 0 && list.every(t => (done[t.id] || 0) >= t.target);
  };
  const str = part('STR');
  const agi = part('AGI');
  const meals = day.meals || [];
  const kcal = sum(meals, m => m.kcal);
  const prot = sum(meals, m => m.prot);
  const live = currentTargets(state.body);
  const kt = day.snap ? day.snap.kt : live.kcal;
  const pt = day.snap ? day.snap.pt : live.prot;
  const vit = kcal > 0 && prot >= pt && Math.abs(kcal - kt) <= kt * 0.1;
  const quiz = day.quiz;
  const int = !!quiz && quiz.answers.every(a => a !== null);
  const correct = quiz ? quiz.answers.filter(a => a === 0).length : 0;
  const requireBoth = day.snap ? day.snap.requireBoth : state.settings.requireBoth;
  const move = requireBoth ? (str && agi) : (str || agi);
  const cleared = vit && int && move;
  return { targets, str, agi, vit, int, correct, kcal, prot, kt, pt, requireBoth, cleared };
}

function dayStatus(k, today) {
  const day = state.days[k];
  if (k === today) {
    if (isRestWeekday(k)) return 'rest';
    return day && evalDay(day).cleared ? 'done' : 'active';
  }
  if (day && day.final) return day.final;
  return isRestWeekday(k) ? 'rest' : 'missed';
}

function dayRewards(day, status) {
  const zero = { STR: 0, AGI: 0, VIT: 0, INT: 0, xp: 0 };
  if (status === 'rest' || !day || !day.level) return zero;
  const ev = evalDay(day);
  const cleared = status === 'done';
  return {
    STR: ev.str ? STAT_GAIN : 0,
    AGI: ev.agi ? STAT_GAIN : 0,
    VIT: ev.vit ? STAT_GAIN : 0,
    INT: ev.correct,
    xp: (ev.str ? XP_PART : 0) + (ev.agi ? XP_PART : 0) + (ev.vit ? XP_PART : 0)
      + ev.correct * XP_PER_CORRECT
      + (cleared ? XP_CLEAR : 0) + (cleared && day.penalty ? XP_PENALTY_CLEAR : 0),
  };
}

// Recomputes everything shown on the Status tab from the saved days.
function derive() {
  const today = todayKey();
  const d = {
    stats: { STR: STAT_START, AGI: STAT_START, VIT: STAT_START, INT: STAT_START },
    xp: 0, quests: 0, streak: 0, best: 0, perfect: 0,
    totals: { pushups: 0, situps: 0, squats: 0, run: 0 },
    todayCleared: false,
  };
  if (state.profile) {
    for (let k = state.profile.created; k <= today; k = addDays(k, 1)) {
      const status = dayStatus(k, today);
      const day = state.days[k];
      if (status === 'rest') continue;
      if (status === 'missed') d.streak = 0;
      if (!day || !day.level) continue;
      const r = dayRewards(day, status);
      d.stats.STR += r.STR; d.stats.AGI += r.AGI; d.stats.VIT += r.VIT; d.stats.INT += r.INT;
      d.xp += r.xp;
      Object.keys(d.totals).forEach(id => { d.totals[id] += (day.done && day.done[id]) || 0; });
      if (day.quiz && day.quiz.answers.every(a => a === 0)) d.perfect++;
      if (status === 'done') {
        d.quests++;
        d.streak++;
        d.best = Math.max(d.best, d.streak);
        if (k === today) d.todayCleared = true;
      }
    }
  }
  d.totals.run = round1(d.totals.run);
  const li = levelInfo(d.xp);
  d.level = li.level; d.into = li.into; d.need = li.need;
  d.rank = rankOf(d.level);
  return d;
}

// Closes every past day that is still open, creates today's entry, and
// decides whether today is a Penalty Quest.
function rollover() {
  if (!state.profile) return;
  const today = todayKey();
  let k = state.lastFinalized ? addDays(state.lastFinalized, 1) : state.profile.created;
  if (k < state.profile.created) k = state.profile.created;
  for (; k < today; k = addDays(k, 1)) {
    const day = state.days[k] || {};
    if (day.final) continue;
    if (isRestWeekday(k)) {
      day.final = 'rest';
    } else if (!day.level) {
      day.final = 'missed';
    } else {
      const ev = evalDay(day);
      day.snap = { kt: ev.kt, pt: ev.pt, requireBoth: ev.requireBoth };
      day.final = ev.cleared ? 'done' : 'missed';
    }
    state.days[k] = day;
  }
  if (addDays(today, -1) >= state.profile.created) state.lastFinalized = addDays(today, -1);

  if (!state.days[today] || !state.days[today].level) {
    const level = derive().level;
    let prev = addDays(today, -1);
    while (prev >= state.profile.created && dayStatus(prev, today) === 'rest') prev = addDays(prev, -1);
    const penalty = prev >= state.profile.created && dayStatus(prev, today) === 'missed';
    state.days[today] = {
      level,
      penalty,
      custom: state.custom.map(c => ({ ...c })),
      done: {},
      meals: [],
      quiz: null,
    };
  }
  save();
}

function todayDay() { return state.days[todayKey()]; }

function syncTodayCustom() {
  const day = todayDay();
  if (day && !day.final) day.custom = state.custom.map(c => ({ ...c }));
}

/* ================= Quiz ================= */

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuiz() {
  const all = Object.keys(QUESTION_BY_ID);
  let unseen = all.filter(id => !state.quizSeen.includes(id));
  if (unseen.length < 5) { state.quizSeen = []; unseen = all; }
  const ids = shuffle(unseen).slice(0, 5);
  state.quizSeen.push(...ids);
  return {
    items: ids.map(id => ({ id, order: shuffle([0, 1, 2, 3]) })),
    answers: ids.map(() => null),
  };
}

/* ================= Sound (made in code, no audio files) ================= */

let audio = null;
const SOUNDS = {
  arrive: [[660, 0.12, 0], [880, 0.2, 0.13]],
  penalty: [[220, 0.25, 0, 'square'], [165, 0.4, 0.28, 'square']],
  clear: [[784, 0.12, 0], [988, 0.12, 0.12], [1175, 0.35, 0.24]],
  level: [[523, 0.1, 0], [659, 0.1, 0.1], [784, 0.1, 0.2], [1047, 0.4, 0.3]],
  title: [[988, 0.12, 0], [1319, 0.4, 0.12]],
  right: [[880, 0.08, 0], [1320, 0.14, 0.08]],
  wrong: [[180, 0.25, 0, 'sawtooth']],
  tick: [[1400, 0.03, 0]],
};

function play(name) {
  if (!state.settings.sound || !SOUNDS[name]) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime + 0.02;
    SOUNDS[name].forEach(([freq, dur, delay, type]) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + dur + 0.02);
    });
  } catch (e) {
    // Sound is optional; ignore browsers that block it.
  }
}

/* ================= UI state ================= */

const ui = {
  tab: 'quest',
  quiz: false,
  feedback: null,
  countdown: 0,
  timer: null,
  popups: [],
  popupPlayed: null,
  modal: null,
  food: { name: '', kcal: '', prot: '' },
  newEx: { name: '', unit: 'reps', stat: 'STR', target: 20 },
  setupName: '',
  message: '',
  logLimit: 30,
  pendingImport: null,
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(n) { return Number(n).toLocaleString(); }

/* ================= Events: pop-ups for level up, titles, clear ================= */

function checkTitles(d, silent) {
  TITLES.forEach(t => {
    if (!state.titles[t.id] && t.test(d)) {
      state.titles[t.id] = todayKey();
      if (!state.activeTitle) state.activeTitle = t.id;
      if (!silent) ui.popups.push({ kind: 'title', title: t });
    }
  });
}

// Runs a change, saves it, then announces anything it unlocked.
function act(change) {
  const before = derive();
  change();
  const after = derive();
  if (!before.todayCleared && after.todayCleared) {
    const r = dayRewards(todayDay(), 'done');
    ui.popups.push({ kind: 'clear', xp: r.xp, penalty: todayDay().penalty });
  }
  if (after.level > before.level) ui.popups.push({ kind: 'level', from: before.level, to: after.level, rank: after.rank, rankUp: after.rank !== before.rank });
  checkTitles(after, false);
  save();
  render();
}

function queueArrival() {
  const today = todayKey();
  if (!state.profile || state.arrivedShown === today) return;
  state.arrivedShown = today;
  const day = todayDay();
  if (isRestWeekday(today)) ui.popups.push({ kind: 'rest' });
  else if (day.penalty) ui.popups.push({ kind: 'penalty' });
  else ui.popups.push({ kind: 'arrive' });
  save();
}

/* ================= Rendering ================= */

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const $overlay = document.getElementById('overlay');

function render() {
  const today = todayKey();
  const day = state.profile ? todayDay() : null;
  const penaltyLook = !!(day && day.penalty && !isRestWeekday(today) && !evalDay(day).cleared);
  document.body.classList.toggle('penalty', penaltyLook);

  if (!state.profile) {
    $nav.classList.add('hidden');
    $app.innerHTML = renderSetup();
  } else if (ui.quiz) {
    $nav.classList.add('hidden');
    $app.innerHTML = renderQuiz();
  } else {
    $nav.classList.remove('hidden');
    const views = { status: renderStatus, quest: renderQuest, log: renderLog, settings: renderSettings };
    $app.innerHTML = (saveFailed ? '<div class="banner red">This browser is blocking storage, so progress can\'t be saved. Try a normal (not private) window.</div>' : '') + views[ui.tab]();
    $nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  }
  renderOverlay();
}

function renderOverlay() {
  if (ui.popups.length) {
    const p = ui.popups[0];
    $overlay.innerHTML = popupHTML(p);
    $overlay.classList.remove('hidden');
    if (ui.popupPlayed !== p) {
      ui.popupPlayed = p;
      play({ arrive: 'arrive', penalty: 'penalty', rest: 'arrive', clear: 'clear', level: 'level', title: 'title' }[p.kind]);
    }
  } else if (ui.modal) {
    $overlay.innerHTML = modalHTML();
    $overlay.classList.remove('hidden');
  } else {
    $overlay.innerHTML = '';
    $overlay.classList.add('hidden');
  }
}

function questSummary(day) {
  const ev = evalDay(day);
  const ex = ev.targets.map(t => esc(t.name) + ' ' + t.target + (t.unit === 'reps' ? '' : ' ' + UNIT_LABEL[t.unit])).join(' · ');
  return ex + '<br>Diet: ' + fmt(ev.kt) + ' kcal · ' + ev.pt + ' g protein<br>Quiz: 5 questions';
}

function popupHTML(p) {
  const brk = t => '<span class="brk">[</span>' + t + '<span class="brk">]</span>';
  const ok = label => '<button class="big" data-action="popup-ok">' + (label || 'OK') + '</button>';
  switch (p.kind) {
    case 'arrive':
      return '<div class="window popup"><div class="kicker label">Notification</div><div class="big-title">' + brk('DAILY QUEST HAS ARRIVED') + '</div><p>' + questSummary(todayDay()) + '</p>' + ok('Accept') + '</div>';
    case 'penalty':
      return '<div class="window popup red"><div class="kicker label">Warning</div><div class="big-title">' + brk('PENALTY QUEST') + '</div><p>You missed your last Daily Quest. Your streak was reset and today\'s STR and AGI targets are 50% higher.</p><p>' + questSummary(todayDay()) + '</p>' + ok('Accept') + '</div>';
    case 'rest':
      return '<div class="window popup"><div class="kicker label">Notification</div><div class="big-title">' + brk('REST DAY') + '</div><p>No quest today. Recover well — your streak is safe.</p>' + ok() + '</div>';
    case 'clear':
      return '<div class="window popup gold"><div class="kicker label">Quest</div><div class="big-title">' + brk('DAILY QUEST COMPLETE') + '</div><p>Rewards: +' + p.xp + ' XP' + (p.penalty ? ' (includes penalty bonus)' : '') + '</p>' + ok() + '</div>';
    case 'level':
      return '<div class="window popup gold"><div class="kicker label">System</div><div class="big-title">LEVEL UP!</div><p>Level ' + p.from + ' → ' + p.to + (p.rankUp ? '<br><b class="gold">Rank up: ' + p.rank + '</b>' : '') + '<br>New targets start tomorrow.</p>' + ok() + '</div>';
    case 'title':
      return '<div class="window popup gold"><div class="kicker label">Title acquired</div><div class="big-title">' + esc(p.title.name) + '</div><p>' + esc(p.title.desc) + '</p>' + ok() + '</div>';
  }
  return '';
}

/* ---------- Setup ---------- */

function renderSetup() {
  return '<div class="setup-logo"><div class="mono">SLF</div><div class="muted label">Self Leveling Fitness</div></div>'
    + '<div class="window"><div class="window-title label">Player Registration</div>'
    + '<div class="field"><div class="lbl"><span>Name</span></div><input type="text" maxlength="24" data-field="setupName" value="' + esc(ui.setupName) + '" placeholder="Your name"></div>'
    + bodyFields()
    + '<div id="calc-out">' + calcOutHTML() + '</div>'
    + (ui.message ? '<p class="bad center small">' + esc(ui.message) + '</p>' : '')
    + '<button class="big" data-action="setup-begin">Begin</button>'
    + '</div>';
}

/* ---------- Status ---------- */

function renderStatus() {
  const d = derive();
  const active = TITLES.find(t => t.id === state.activeTitle);
  const statInfo = [
    ['STR', 'Push-ups · Sit-ups · Squats'],
    ['AGI', 'Running'],
    ['VIT', 'Diet'],
    ['INT', 'Daily quiz'],
  ];
  const maxStat = Math.max(50, ...Object.values(d.stats));
  let html = reminderBanner(d);
  html += '<div class="window"><div class="window-title label">Status</div><div class="hero">'
    + '<div class="rank">' + d.rank + '</div><div><div class="name">' + esc(state.profile.name) + '</div>'
    + '<div class="sub">Level ' + d.level + ' · Rank ' + d.rank + '</div>'
    + (active ? '<div class="title-chip">Title: ' + esc(active.name) + '</div>' : '')
    + '</div></div><div class="xp"><div class="row"><span class="label" style="font-size:11px">XP</span><span>' + d.into + ' / ' + d.need + '</span></div>'
    + '<div class="bar"><i style="width:' + Math.round(d.into / d.need * 100) + '%"></i></div></div></div>';

  html += '<div class="window"><div class="window-title label">Stats</div><div class="stats">'
    + statInfo.map(([k, from]) => '<div class="stat"><div class="top"><span class="k">' + k + '</span><span class="v">' + d.stats[k] + '</span></div><div class="from">' + from + '</div><div class="bar"><i style="width:' + Math.round(d.stats[k] / maxStat * 100) + '%"></i></div></div>').join('')
    + '</div></div>';

  html += '<div class="window"><div class="streak">'
    + '<div><b>' + d.streak + '</b><span>Day streak</span></div>'
    + '<div><b>' + d.quests + '</b><span>Quests cleared</span></div>'
    + '<div><b>' + d.best + '</b><span>Best streak</span></div>'
    + '</div></div>';

  const earned = TITLES.filter(t => state.titles[t.id]);
  const locked = TITLES.filter(t => !state.titles[t.id]);
  html += '<div class="window"><div class="window-title label">Titles</div>'
    + (earned.length ? '<p class="note" style="margin:0 0 8px">Tap a title to show it under your name.</p>' : '<p class="note" style="margin:0 0 8px">Clear your first quest to earn a title.</p>')
    + '<div class="titles">'
    + earned.map(t => '<button class="t' + (t.id === state.activeTitle ? ' on' : '') + '" data-action="equip" data-id="' + t.id + '" title="' + esc(t.desc) + '">' + esc(t.name) + '</button>').join('')
    + locked.map(t => '<span class="locked" title="' + esc(t.desc) + '">' + esc(t.name) + '</span>').join('')
    + '</div></div>';
  return html;
}

/* ---------- Quest ---------- */

function remainingParts(ev) {
  const left = [];
  if (ev.requireBoth) {
    if (!ev.str) left.push('STR');
    if (!ev.agi) left.push('AGI');
  } else if (!ev.str && !ev.agi) {
    left.push('STR or AGI');
  }
  if (!ev.vit) left.push('VIT (diet)');
  if (!ev.int) left.push('INT (quiz)');
  return left;
}

function reminderBanner(d) {
  const h = state.settings.reminderHour;
  const today = todayKey();
  if (h == null || nowDate().getHours() < h || isRestWeekday(today) || d.todayCleared) return '';
  const left = remainingParts(evalDay(todayDay()));
  return '<div class="banner">⚠ Still left today: ' + left.join(', ') + '</div>';
}

function exRow(t, day) {
  const have = (day.done && day.done[t.id]) || 0;
  const ok = have >= t.target;
  const unit = UNIT_LABEL[t.unit];
  const steps = t.unit === 'km' ? [0.5, 1] : [1, 5, 10];
  const minus = t.unit === 'km' ? 0.5 : 1;
  return '<div class="ex"><div class="ex-top"><span class="n">' + esc(t.name) + '</span><span class="c' + (ok ? ' ok' : '') + '">' + round1(have) + ' / ' + t.target + (t.unit === 'reps' ? '' : ' ' + unit) + '</span></div>'
    + '<div class="btns"><button class="minus" data-action="add" data-id="' + t.id + '" data-amt="-' + minus + '" aria-label="Remove ' + minus + '">−' + minus + '</button>'
    + steps.map(s => '<button data-action="add" data-id="' + t.id + '" data-amt="' + s + '">+' + s + '</button>').join('')
    + '<span class="typed"><input type="number" inputmode="decimal" min="0" step="' + (t.unit === 'km' ? '0.1' : '1') + '" placeholder="' + unit + '" data-typed="' + t.id + '" aria-label="Amount of ' + esc(t.name) + '">'
    + '<button data-action="add-typed" data-id="' + t.id + '">Add</button></span></div></div>';
}

function renderQuest() {
  const today = todayKey();
  const d = derive();
  let html = reminderBanner(d);
  if (isRestWeekday(today)) {
    return html + '<div class="window center"><div class="window-title label">Rest Day</div><p>No quest today. Recover well — your streak is safe.</p><p class="note">Change rest days in Settings.</p></div>';
  }
  const day = todayDay();
  const ev = evalDay(day);
  const partsDone = [ev.str, ev.agi, ev.vit, ev.int].filter(Boolean).length;
  const rule = ev.requireBoth ? 'Required: STR + AGI + VIT + INT' : 'Required: VIT + INT + STR or AGI';
  const optional = stat => !ev.requireBoth && (stat === 'STR' ? ev.agi && !ev.str : ev.str && !ev.agi);

  if (day.penalty && !ev.cleared) html += '<div class="banner red">PENALTY QUEST — STR and AGI targets are 50% higher today.</div>';

  html += '<div class="window"><div class="window-title label">' + (day.penalty ? 'Penalty Quest' : 'Daily Quest') + '</div>'
    + '<div class="quest-head"><div>' + (ev.cleared ? '<b class="good">QUEST CLEARED</b>' : 'Complete before midnight.') + '</div>'
    + '<div class="goal">' + rule + ' · ' + partsDone + ' of 4 parts done</div></div>';

  ['STR', 'AGI'].forEach(stat => {
    const done = stat === 'STR' ? ev.str : ev.agi;
    const list = ev.targets.filter(t => t.stat === stat);
    html += '<div class="block' + (done ? ' done' : '') + (optional(stat) ? ' optional' : '') + '"><div class="block-h"><span class="label">' + stat + '</span><span class="tag">'
      + (done ? '✓ Done · +' + STAT_GAIN + ' ' + stat : optional(stat) ? 'Optional today' : 'In progress') + '</span></div>'
      + list.map(t => exRow(t, day)).join('') + '</div>';
  });

  const kcalPct = Math.min(100, Math.round(ev.kcal / ev.kt * 100));
  const protPct = Math.min(100, Math.round(ev.prot / ev.pt * 100));
  const kcalOver = ev.kcal > ev.kt * 1.1;
  const kcalOk = Math.abs(ev.kcal - ev.kt) <= ev.kt * 0.1;
  html += '<div class="block' + (ev.vit ? ' done' : '') + '"><div class="block-h"><span class="label">VIT</span><span class="tag">' + (ev.vit ? '✓ Done · +' + STAT_GAIN + ' VIT' : 'Aim within 10% of calories') + '</span></div>'
    + '<div class="ex"><div class="ex-top"><span class="n">Calories</span><span class="c' + (kcalOk ? ' ok' : kcalOver ? ' bad' : '') + '">' + fmt(ev.kcal) + ' / ' + fmt(ev.kt) + ' kcal</span></div>'
    + '<div class="bar' + (kcalOver ? ' over' : kcalOk ? ' good' : '') + '" style="margin-top:6px"><i style="width:' + kcalPct + '%"></i></div></div>'
    + '<div class="ex"><div class="ex-top"><span class="n">Protein</span><span class="c' + (ev.prot >= ev.pt ? ' ok' : '') + '">' + fmt(ev.prot) + ' / ' + ev.pt + ' g</span></div>'
    + '<div class="bar' + (ev.prot >= ev.pt ? ' good' : '') + '" style="margin-top:6px"><i style="width:' + protPct + '%"></i></div></div>'
    + (day.meals.length ? '<div style="margin-top:8px">' + day.meals.map((m, i) => '<div class="meal"><span>' + esc(m.name || 'Meal ' + (i + 1)) + '</span><span class="muted">' + fmt(m.kcal) + ' kcal · ' + fmt(m.prot) + ' g <button class="x" data-action="meal-del" data-i="' + i + '" aria-label="Delete">✕</button></span></div>').join('') + '</div>' : '')
    + '<div style="margin-top:10px"><button class="big" data-action="food-open">+ Add food</button></div></div>';

  const answered = day.quiz ? day.quiz.answers.filter(a => a !== null).length : 0;
  html += '<div class="block' + (ev.int ? ' done' : '') + '"><div class="block-h"><span class="label">INT</span><span class="tag">'
    + (ev.int ? '✓ ' + ev.correct + ' / 5 correct · +' + ev.correct + ' INT' : '+1 INT per correct answer') + '</span></div>'
    + (ev.int
      ? '<div class="ex"><div class="ex-top"><span class="n">Daily quiz</span><span class="c ok">Answered</span></div></div>'
      : '<button class="big" data-action="quiz-open">' + (answered ? 'Continue quiz (' + answered + ' / 5)' : 'Start daily quiz') + '</button>')
    + '</div>';

  if (!ev.cleared) html += '<div class="warn">Missing the Daily Quest brings a Penalty Quest tomorrow.</div>';
  html += '</div>';
  return html;
}

/* ---------- Quiz ---------- */

function renderQuiz() {
  const quiz = todayDay().quiz;
  const idx = ui.feedback !== null ? ui.feedback : quiz.answers.findIndex(a => a === null);
  const dots = '<div class="dots">' + quiz.answers.map((a, i) => '<i class="' + (a === null ? (i === idx ? 'cur' : '') : a === 0 ? 'right' : 'wrong') + '"></i>').join('') + '</div>';

  if (idx === -1) {
    const correct = quiz.answers.filter(a => a === 0).length;
    return '<div class="window center"><div class="window-title label">Daily Quiz</div>' + dots
      + '<div class="quiz-q">' + correct + ' / 5 correct</div><p class="good">+' + correct + ' INT</p>'
      + '<p class="note">New questions tomorrow.</p><div style="margin-top:14px"><button class="big" data-action="quiz-close">Back to quest</button></div></div>';
  }

  const item = quiz.items[idx];
  const q = QUESTION_BY_ID[item.id] || ['(Question missing)', '-', '-', '-', '-', ''];
  const ans = quiz.answers[idx];
  const answeredNow = ans !== null;
  let html = '<div class="window"><div class="window-title label">Daily Quiz · ' + (idx + 1) + ' / 5</div>' + dots
    + '<div class="quiz-q">' + esc(q[0]) + '</div><div class="choices">'
    + item.order.map(opt => {
      let cls = '';
      if (answeredNow && opt === 0) cls = 'right';
      else if (answeredNow && opt === ans) cls = 'wrong';
      return '<button class="' + cls + '" data-action="answer" data-opt="' + opt + '"' + (answeredNow ? ' disabled' : '') + '>' + esc(q[1 + opt]) + '</button>';
    }).join('') + '</div>';

  if (answeredNow) {
    const last = quiz.answers.every(a => a !== null);
    html += '<div class="explain">' + (ans === 0 ? '<b class="good">Correct! +1 INT</b>' : '<b class="bad">Wrong.</b> Correct answer: <b class="good">' + esc(q[1]) + '</b>')
      + (q[5] ? '<br>' + esc(q[5]) : '') + '</div>'
      + '<div style="margin-top:14px"><button class="big" data-action="quiz-next">' + (last ? 'See result' : 'Next')
      + (ui.timer ? ' (<span id="countdown">' + ui.countdown + '</span>s)' : '') + '</button></div>';
  } else {
    html += '<div style="margin-top:14px"><button data-action="quiz-close">Leave (progress is saved)</button></div>';
  }
  return html + '</div>';
}

function stopTimer() {
  if (ui.timer) clearInterval(ui.timer);
  ui.timer = null;
}

function quizAdvance() {
  stopTimer();
  ui.feedback = null;
  render();
  window.scrollTo(0, 0);
}

/* ---------- Log ---------- */

function renderLog() {
  const d = derive();
  const today = todayKey();
  let html = '<div class="window"><div class="window-title label">Totals</div><div class="calc-out" style="margin:0">'
    + '<div><b>' + fmt(d.totals.pushups) + '</b><span>Push-ups</span></div>'
    + '<div><b>' + fmt(d.totals.situps) + '</b><span>Sit-ups</span></div>'
    + '<div><b>' + fmt(d.totals.squats) + '</b><span>Squats</span></div>'
    + '<div><b>' + d.totals.run + '</b><span>km run</span></div>'
    + '<div><b>' + d.quests + '</b><span>Quests cleared</span></div>'
    + '<div><b>' + d.perfect + '</b><span>Perfect quizzes</span></div>'
    + '</div></div>';

  const keys = [];
  for (let k = today; k >= state.profile.created && keys.length < ui.logLimit; k = addDays(k, -1)) keys.push(k);
  const labels = { done: 'Cleared', missed: 'Missed', rest: 'Rest', active: 'Today' };

  html += '<div class="window"><div class="window-title label">History</div>'
    + keys.map(k => {
      const status = dayStatus(k, today);
      const day = state.days[k];
      let detail = '';
      if (status === 'rest') {
        detail = 'Rest day';
      } else if (!day || !day.level) {
        detail = 'App not opened';
      } else {
        const ev = evalDay(day);
        const parts = ev.targets.filter(t => day.done[t.id]).map(t => esc(t.name) + ' ' + round1(day.done[t.id]) + (t.unit === 'reps' ? '' : ' ' + UNIT_LABEL[t.unit]));
        if (ev.kcal || ev.prot) parts.push(fmt(ev.kcal) + ' kcal · ' + fmt(ev.prot) + ' g protein');
        if (day.quiz) parts.push('Quiz ' + ev.correct + '/5');
        const r = dayRewards(day, status);
        detail = (parts.length ? parts.join(' · ') : 'Nothing logged') + (r.xp ? ' · +' + r.xp + ' XP' : '');
        if (day.penalty) detail = '<span class="bad">Penalty Quest.</span> ' + detail;
      }
      return '<div class="day"><div class="day-h"><span class="d">' + prettyDate(k) + '</span><span class="badge ' + status + '">' + labels[status] + '</span></div><div class="detail">' + detail + '</div></div>';
    }).join('')
    + (addDays(today, -keys.length) >= state.profile.created ? '<div style="margin-top:10px"><button class="big" data-action="log-more">Show older days</button></div>' : '')
    + '</div>';
  return html;
}

/* ---------- Settings ---------- */

// Number settings: each has a slider and a box you can type in.
const BINDS = {
  age: { get: () => state.body.age, set: v => { state.body.age = Math.round(v); }, min: 13, max: 90, step: 1, show: v => v + ' years' },
  heightCm: { get: () => Math.round(state.body.heightCm), set: v => { state.body.heightCm = v; }, min: 120, max: 230, step: 1, show: v => v + ' cm' },
  heightIn: {
    get: () => Math.round(state.body.heightCm / 2.54), set: v => { state.body.heightCm = v * 2.54; }, min: 47, max: 90, step: 1,
    show: v => Math.floor(v / 12) + ' ft ' + (v % 12) + ' in',
  },
  weightKg: { get: () => round1(state.body.weightKg), set: v => { state.body.weightKg = v; }, min: 30, max: 250, step: 0.5, show: v => v + ' kg' },
  weightLb: { get: () => Math.round(state.body.weightKg * 2.20462), set: v => { state.body.weightKg = v / 2.20462; }, min: 66, max: 550, step: 1, show: v => v + ' lb' },
  calTarget: { get: () => currentTargets(state.body).kcal, set: v => { state.body.calTarget = Math.round(v); }, min: 1000, max: 6000, step: 10, show: v => fmt(v) + ' kcal' },
  protTarget: { get: () => currentTargets(state.body).prot, set: v => { state.body.protTarget = Math.round(v); }, min: 30, max: 400, step: 5, show: v => v + ' g' },
  newTarget: {
    get: () => ui.newEx.target, set: v => { ui.newEx.target = v; },
    min: 0.5, max: 500, step: 0.5, show: v => v + ' ' + UNIT_LABEL[ui.newEx.unit],
  },
};

function numField(key, label) {
  const B = BINDS[key];
  const v = B.get();
  const attrs = ' min="' + B.min + '" max="' + B.max + '" step="' + B.step + '" value="' + v + '" data-bind="' + key + '"';
  return '<div class="field"><div class="lbl"><span>' + label + '</span><span data-show="' + key + '">' + B.show(v) + '</span></div>'
    + '<div class="combo"><input type="range"' + attrs + ' aria-label="' + label + ' slider"><input type="number" inputmode="decimal"' + attrs + ' aria-label="' + label + '"></div></div>';
}

function seg(action, options, current) {
  return '<div class="seg">' + options.map(([v, label]) => '<button class="' + (v === current ? 'on' : '') + '" data-action="' + action + '" data-v="' + v + '">' + label + '</button>').join('') + '</div>';
}

function bodyFields() {
  const b = state.body;
  const imp = state.settings.units === 'imperial';
  return '<div class="field"><div class="lbl"><span>Units</span></div>' + seg('units', [['metric', 'kg / cm'], ['imperial', 'lb / ft']], state.settings.units) + '</div>'
    + '<div class="field"><div class="lbl"><span>Sex</span></div>' + seg('sex', [['male', 'Male'], ['female', 'Female']], b.sex) + '</div>'
    + numField('age', 'Age')
    + numField(imp ? 'heightIn' : 'heightCm', 'Height')
    + numField(imp ? 'weightLb' : 'weightKg', 'Weight')
    + '<div class="field"><div class="lbl"><span>Activity level</span></div><select data-select="activity">'
    + ACTIVITY.map(a => '<option value="' + a.v + '"' + (a.v === b.activity ? ' selected' : '') + '>' + a.label + '</option>').join('') + '</select></div>'
    + '<div class="field"><div class="lbl"><span>Goal</span></div><select data-select="goal">'
    + Object.entries(GOALS).map(([k, g]) => '<option value="' + k + '"' + (k === b.goal ? ' selected' : '') + '>' + g.label + '</option>').join('') + '</select></div>';
}

function calcOutHTML() {
  const b = state.body;
  const s = suggestedTargets(b);
  const goal = GOALS[b.goal];
  const goalText = goal.kcal === 0 ? 'maintenance' : (goal.kcal > 0 ? '+' : '−') + Math.abs(goal.kcal) + ' kcal';
  return '<div class="calc-out">'
    + '<div><b>' + fmt(Math.round(bmr(b))) + '</b><span>BMR (at rest)</span></div>'
    + '<div><b>' + fmt(maintenance(b)) + '</b><span>Maintenance kcal</span></div>'
    + '<div><b>' + fmt(s.kcal) + '</b><span>Suggested target (' + goalText + ')</span></div>'
    + '<div><b>' + s.prot + ' g</b><span>Suggested protein (' + goal.prot + ' g/kg)</span></div>'
    + '</div>'
    + (s.floored ? '<p class="note gold">Target raised to the safe minimum of ' + fmt(calorieFloor(b)) + ' kcal.</p>' : '');
}

function toggleRow(key, title, sub) {
  const on = !!state.settings[key];
  return '<div class="toggle-row"><div class="txt">' + title + (sub ? '<small>' + sub + '</small>' : '') + '</div>'
    + '<button class="switch' + (on ? ' on' : '') + '" data-action="toggle" data-key="' + key + '" aria-pressed="' + on + '">' + (on ? 'ON' : 'OFF') + '</button></div>';
}

function renderSettings() {
  const s = state.settings;
  const b = state.body;
  const custom = b.calTarget != null || b.protTarget != null;
  const days = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
  const hours = [null, 12, 14, 16, 17, 18, 19, 20, 21, 22];
  const nx = ui.newEx;

  let html = '<div class="window"><div class="window-title label">Profile</div>'
    + '<div class="field"><div class="lbl"><span>Name</span></div><input type="text" maxlength="24" data-field="name" value="' + esc(state.profile.name) + '"></div></div>';

  html += '<div class="window"><div class="window-title label">Body & Calories</div>' + bodyFields()
    + '<div id="calc-out">' + calcOutHTML() + '</div>'
    + '<div class="sub-title">Your daily targets' + (custom ? ' (adjusted)' : '') + '</div>'
    + numField('calTarget', 'Calories') + numField('protTarget', 'Protein')
    + '<button data-action="cal-reset"' + (custom ? '' : ' disabled') + '>Use suggested targets</button></div>';

  html += '<div class="window"><div class="window-title label">Quest Rules</div>'
    + toggleRow('requireBoth', 'Require both STR and AGI', 'Off: VIT + INT + either STR or AGI clears the quest.')
    + '<div class="sub-title">Rest days</div><div class="chips">'
    + days.map(([n, l]) => '<button class="' + (s.rest.includes(n) ? 'on' : '') + '" data-action="rest" data-v="' + n + '">' + l + '</button>').join('')
    + '</div><p class="note">Rest days have no quest and keep your streak.</p></div>';

  html += '<div class="window"><div class="window-title label">Custom Exercises</div>'
    + (state.custom.length
      ? state.custom.map(c => '<div class="meal"><span>' + esc(c.name) + ' <span class="muted">· ' + c.target + ' ' + UNIT_LABEL[c.unit] + ' · ' + c.stat + '</span></span><button class="x" data-action="ex-del" data-id="' + c.id + '" aria-label="Delete">✕</button></div>').join('')
      : '<p class="note" style="margin-top:0">None yet. Added exercises join today\'s quest.</p>')
    + '<div class="sub-title">Add exercise</div>'
    + '<div class="field"><input type="text" maxlength="24" data-field="newExName" value="' + esc(nx.name) + '" placeholder="Name, e.g. Plank"></div>'
    + '<div class="field"><div class="lbl"><span>Measured in</span></div>' + seg('ex-unit', [['reps', 'Reps'], ['km', 'km'], ['min', 'Minutes']], nx.unit) + '</div>'
    + '<div class="field"><div class="lbl"><span>Counts toward</span></div>' + seg('ex-stat', [['STR', 'STR'], ['AGI', 'AGI']], nx.stat) + '</div>'
    + numField('newTarget', 'Daily target')
    + (ui.message ? '<p class="bad small">' + esc(ui.message) + '</p>' : '')
    + '<button class="big" data-action="ex-add">Add exercise</button></div>';

  html += '<div class="window"><div class="window-title label">Quiz, Sound & Reminder</div>'
    + '<div class="field"><div class="lbl"><span>After each answer</span></div><select data-select="quizMode">'
    + [['next', 'Wait for Next button'], ['3', 'Auto-continue after 3 s'], ['5', 'Auto-continue after 5 s'], ['10', 'Auto-continue after 10 s']]
      .map(([v, l]) => '<option value="' + v + '"' + (s.quizMode === v ? ' selected' : '') + '>' + l + '</option>').join('')
    + '</select></div>'
    + toggleRow('sound', 'Sound effects')
    + '<div class="field" style="margin-top:8px"><div class="lbl"><span>Reminder banner</span></div><select data-select="reminder">'
    + hours.map(h => '<option value="' + (h == null ? '' : h) + '"' + (s.reminderHour === h ? ' selected' : '') + '>' + (h == null ? 'Off' : 'From ' + (h > 12 ? h - 12 + ' PM' : '12 PM')) + '</option>').join('')
    + '</select><p class="note">When you open the app after this time, it lists what is left today.</p></div></div>';

  html += '<div class="window"><div class="window-title label">Backup</div>'
    + '<p class="note" style="margin-top:0">Progress lives only in this browser. Save a backup file before switching phones or clearing browser data.</p>'
    + '<div class="row2" style="display:flex;gap:8px;margin-top:10px"><button style="flex:1" data-action="export">Export backup</button><button style="flex:1" data-action="import">Import backup</button></div>'
    + '<input type="file" id="import-file" accept=".json,application/json" class="hidden"></div>';

  html += '<div class="window"><div class="window-title label">Danger Zone</div><button class="big danger" data-action="reset">Reset all progress</button></div>';
  html += '<p class="note center">SLF — Self Leveling Fitness · v' + VERSION + '</p>';
  return html;
}

/* ---------- Modals ---------- */

function modalHTML() {
  const m = ui.modal;
  if (m === 'food') {
    const f = ui.food;
    return '<div class="window modal"><div class="window-title label">Add Food</div>'
      + '<div class="field"><div class="lbl"><span>Name (optional)</span></div><input type="text" maxlength="30" data-field="foodName" value="' + esc(f.name) + '" placeholder="e.g. Chicken rice"></div>'
      + '<div class="field"><div class="lbl"><span>Calories (kcal)</span></div><input type="number" inputmode="numeric" min="0" data-field="foodKcal" value="' + esc(f.kcal) + '">'
      + '<div class="btns"><button data-action="food-quick" data-f="kcal" data-amt="100">+100</button><button data-action="food-quick" data-f="kcal" data-amt="50">+50</button><button class="minus" data-action="food-quick" data-f="kcal" data-amt="-100">−100</button></div></div>'
      + '<div class="field"><div class="lbl"><span>Protein (g)</span></div><input type="number" inputmode="numeric" min="0" data-field="foodProt" value="' + esc(f.prot) + '">'
      + '<div class="btns"><button data-action="food-quick" data-f="prot" data-amt="10">+10</button><button data-action="food-quick" data-f="prot" data-amt="5">+5</button><button class="minus" data-action="food-quick" data-f="prot" data-amt="-10">−10</button></div></div>'
      + (ui.message ? '<p class="bad small">' + esc(ui.message) + '</p>' : '')
      + '<div class="row2"><button data-action="modal-close">Cancel</button><button data-action="food-save">Add</button></div></div>';
  }
  if (m === 'reset') {
    return '<div class="window modal popup red"><div class="big-title">RESET EVERYTHING?</div><p>This deletes your level, stats, titles and history in this browser. It cannot be undone. Export a backup first if you might want it back.</p>'
      + '<div class="row2"><button data-action="modal-close">Cancel</button><button class="danger" data-action="reset-confirm">Delete all</button></div></div>';
  }
  if (m === 'import') {
    const p = ui.pendingImport;
    return '<div class="window modal popup"><div class="big-title">IMPORT BACKUP?</div><p>Backup of <b>' + esc(p.profile.name) + '</b> with ' + Object.keys(p.days).length + ' days. It will replace the progress in this browser.</p>'
      + '<div class="row2"><button data-action="modal-close">Cancel</button><button data-action="import-confirm">Replace</button></div></div>';
  }
  if (m === 'import-error') {
    return '<div class="window modal popup red"><div class="big-title">NOT A BACKUP</div><p>That file is not an SLF backup. Nothing was changed.</p><button class="big" data-action="modal-close">OK</button></div>';
  }
  return '';
}

/* ================= Actions ================= */

const actions = {
  tab(el) { ui.tab = el.dataset.tab; ui.message = ''; render(); window.scrollTo(0, 0); },

  'popup-ok'() { ui.popups.shift(); renderOverlay(); },

  add(el) {
    const id = el.dataset.id;
    const amt = parseFloat(el.dataset.amt);
    play('tick');
    act(() => {
      const day = todayDay();
      day.done[id] = Math.max(0, round1((day.done[id] || 0) + amt));
    });
  },

  'add-typed'(el) {
    const input = document.querySelector('[data-typed="' + el.dataset.id + '"]');
    const amt = parseFloat(input && input.value);
    if (!isFinite(amt) || amt === 0) return;
    el.dataset.amt = String(amt);
    actions.add(el);
  },

  'food-open'() { ui.food = { name: '', kcal: '', prot: '' }; ui.message = ''; ui.modal = 'food'; renderOverlay(); },

  'food-quick'(el) {
    const f = el.dataset.f;
    ui.food[f] = String(Math.max(0, (parseFloat(ui.food[f]) || 0) + parseFloat(el.dataset.amt)));
    renderOverlay();
  },

  'food-save'() {
    const kcal = Math.round(parseFloat(ui.food.kcal) || 0);
    const prot = Math.round(parseFloat(ui.food.prot) || 0);
    if (kcal <= 0 && prot <= 0) { ui.message = 'Enter calories or protein.'; renderOverlay(); return; }
    if (kcal < 0 || prot < 0 || kcal > 10000 || prot > 1000) { ui.message = 'That number looks too big.'; renderOverlay(); return; }
    ui.modal = null;
    ui.message = '';
    act(() => { todayDay().meals.push({ name: ui.food.name.trim(), kcal, prot }); });
  },

  'meal-del'(el) { act(() => { todayDay().meals.splice(Number(el.dataset.i), 1); }); },

  'modal-close'() { ui.modal = null; ui.message = ''; ui.pendingImport = null; renderOverlay(); },

  'quiz-open'() {
    const day = todayDay();
    if (!day.quiz) { day.quiz = pickQuiz(); save(); }
    ui.quiz = true;
    ui.feedback = null;
    render();
    window.scrollTo(0, 0);
  },

  answer(el) {
    const day = todayDay();
    const idx = day.quiz.answers.findIndex(a => a === null);
    if (idx === -1 || ui.feedback !== null) return;
    const opt = Number(el.dataset.opt);
    play(opt === 0 ? 'right' : 'wrong');
    ui.feedback = idx;
    const secs = Number(state.settings.quizMode);
    if (secs > 0) {
      ui.countdown = secs;
      ui.timer = setInterval(() => {
        ui.countdown--;
        const c = document.getElementById('countdown');
        if (ui.countdown <= 0) quizAdvance();
        else if (c) c.textContent = ui.countdown;
      }, 1000);
    }
    act(() => { day.quiz.answers[idx] = opt; });
  },

  'quiz-next'() { quizAdvance(); },

  'quiz-close'() { stopTimer(); ui.feedback = null; ui.quiz = false; render(); },

  units(el) { state.settings.units = el.dataset.v; save(); render(); },

  sex(el) { act(() => { state.body.sex = el.dataset.v; }); },

  'cal-reset'() { act(() => { state.body.calTarget = null; state.body.protTarget = null; }); },

  toggle(el) { const k = el.dataset.key; act(() => { state.settings[k] = !state.settings[k]; }); },

  rest(el) {
    const n = Number(el.dataset.v);
    act(() => {
      const r = state.settings.rest;
      state.settings.rest = r.includes(n) ? r.filter(x => x !== n) : r.concat(n);
    });
  },

  'ex-unit'(el) {
    ui.newEx.unit = el.dataset.v;
    ui.newEx.target = el.dataset.v === 'km' ? 1 : el.dataset.v === 'min' ? 10 : 20;
    render();
  },

  'ex-stat'(el) { ui.newEx.stat = el.dataset.v; render(); },

  'ex-add'() {
    const nx = ui.newEx;
    const name = nx.name.trim();
    if (!name) { ui.message = 'Give the exercise a name.'; render(); return; }
    if (!(nx.target > 0)) { ui.message = 'Set a daily target above 0.'; render(); return; }
    ui.message = '';
    act(() => {
      const target = nx.unit === 'km' ? Math.round(nx.target * 2) / 2 : Math.max(1, Math.round(nx.target));
      state.custom.push({ id: 'c' + Date.now(), name, unit: nx.unit, stat: nx.stat, target });
      syncTodayCustom();
      ui.newEx = { name: '', unit: 'reps', stat: 'STR', target: 20 };
    });
  },

  'ex-del'(el) {
    act(() => {
      state.custom = state.custom.filter(c => c.id !== el.dataset.id);
      syncTodayCustom();
    });
  },

  equip(el) { state.activeTitle = el.dataset.id; save(); render(); },

  'log-more'() { ui.logLimit += 30; render(); },

  export() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'slf-backup-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  import() { document.getElementById('import-file').click(); },

  'import-confirm'() {
    state = mergeState(ui.pendingImport);
    ui.pendingImport = null;
    ui.modal = null;
    state.arrivedShown = todayKey();
    rollover();
    checkTitles(derive(), true);
    save();
    ui.tab = 'status';
    render();
  },

  reset() { ui.modal = 'reset'; renderOverlay(); },

  'reset-confirm'() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    state = freshState();
    ui.modal = null;
    ui.popups = [];
    ui.tab = 'quest';
    ui.setupName = '';
    render();
  },

  'setup-begin'() {
    const name = ui.setupName.trim();
    if (!name) { ui.message = 'Enter your name to begin.'; render(); return; }
    ui.message = '';
    const today = todayKey();
    state.profile = { name, created: today };
    state.lastFinalized = addDays(today, -1);
    shownDay = today;
    rollover();
    queueArrival();
    ui.tab = 'quest';
    render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action], nav [data-tab]');
  if (!el || el.disabled) return;
  const name = el.dataset.action || 'tab';
  if (actions[name]) actions[name](el);
});

function applyBind(src, v) {
  const key = src.dataset.bind;
  BINDS[key].set(v);
  if (key !== 'newTarget') save();
  document.querySelectorAll('[data-bind="' + key + '"]').forEach(x => { if (x !== src) x.value = v; });
  refreshLive();
}

// Updates numbers on screen without re-drawing, so sliders keep working
// while being dragged.
function refreshLive() {
  document.querySelectorAll('[data-show]').forEach(x => {
    const B = BINDS[x.dataset.show];
    x.textContent = B.show(B.get());
  });
  const co = document.getElementById('calc-out');
  if (co) co.innerHTML = calcOutHTML();
  ['calTarget', 'protTarget'].forEach(k => {
    document.querySelectorAll('[data-bind="' + k + '"]').forEach(x => {
      if (x !== document.activeElement) x.value = BINDS[k].get();
    });
  });
}

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.bind) {
    const B = BINDS[el.dataset.bind];
    const v = parseFloat(el.value);
    if (isFinite(v) && v >= B.min && v <= B.max) applyBind(el, v);
  } else if (el.dataset.field) {
    const f = el.dataset.field;
    if (f === 'setupName') ui.setupName = el.value;
    else if (f === 'newExName') ui.newEx.name = el.value;
    else if (f === 'foodName') ui.food.name = el.value;
    else if (f === 'foodKcal') ui.food.kcal = el.value;
    else if (f === 'foodProt') ui.food.prot = el.value;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.bind) {
    const B = BINDS[el.dataset.bind];
    let v = parseFloat(el.value);
    if (!isFinite(v)) v = B.get();
    v = Math.min(B.max, Math.max(B.min, v));
    el.value = v;
    applyBind(el, v);
    if (el.dataset.bind !== 'newTarget') act(() => {});
  } else if (el.dataset.select) {
    const k = el.dataset.select;
    act(() => {
      if (k === 'activity') state.body.activity = Number(el.value);
      else if (k === 'goal') state.body.goal = el.value;
      else if (k === 'quizMode') state.settings.quizMode = el.value;
      else if (k === 'reminder') state.settings.reminderHour = el.value === '' ? null : Number(el.value);
    });
  } else if (el.dataset.field === 'name') {
    const name = el.value.trim();
    if (name) { state.profile.name = name; save(); }
    render();
  } else if (el.id === 'import-file' && el.files && el.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || data.version !== 1 || !data.profile || !data.profile.name || !data.profile.created || typeof data.days !== 'object') throw new Error('bad');
        ui.pendingImport = data;
        ui.modal = 'import';
      } catch (err) {
        ui.modal = 'import-error';
      }
      renderOverlay();
    };
    reader.readAsText(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.typed) {
    const btn = document.querySelector('[data-action="add-typed"][data-id="' + e.target.dataset.typed + '"]');
    if (btn) btn.click();
  }
});

/* ================= Start ================= */

let shownDay = null;

function checkNewDay() {
  if (!state.profile) return;
  const today = todayKey();
  if (today === shownDay) return;
  shownDay = today;
  stopTimer();
  ui.quiz = false;
  ui.feedback = null;
  rollover();
  checkTitles(derive(), false);
  queueArrival();
  render();
}

load();
if (state.profile) {
  checkNewDay();
} else {
  render();
}
setInterval(checkNewDay, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewDay(); });
