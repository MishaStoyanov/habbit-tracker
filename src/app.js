let DATA = null;
let summaryPeriod = 'month';

const DAY_MS = 24 * 60 * 60 * 1000;

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function round(n, digits = 0) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function daysSince(iso, ref = Date.now()) {
  return (ref - new Date(iso).getTime()) / DAY_MS;
}

function withinDays(iso, days) {
  return daysSince(iso) <= days;
}

// ---------- init ----------

async function init() {
  DATA = await window.api.getData();
  setupTabs();
  setupTitlebar();
  setupHabitHandlers();
  setupCalorieHandlers();
  setupSummaryHandlers();
  setupSettingsHandlers();
  renderAll();
  setInterval(renderBadHabits, 60 * 1000);
}

function persist() {
  window.api.saveData(DATA);
}

function renderAll() {
  renderBadHabits();
  renderActivity();
  renderExpenses();
  renderCalories();
  renderSummary();
  renderSettings();
}

// ---------- tabs & titlebar ----------

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

function setupTitlebar() {
  document.getElementById('minimizeBtn').addEventListener('click', () => window.api.hideWindow());
}

// ---------- bad habits ----------

function motivationalMessage(days) {
  if (days < 1) return 'Тримайся! Перші 24 години найважчі.';
  if (days < 3) return 'Перший день позаду. Не зливай прогрес.';
  if (days < 7) return 'Вже кілька днів. Так тримати!';
  if (days < 30) return 'Більше тижня! Це вже звичка.';
  return 'Місяць+! Ти інша людина тепер.';
}

function streakStart(habit) {
  if (habit.relapses.length === 0) return habit.startDate;
  return habit.relapses[habit.relapses.length - 1].time;
}

function recordStreakDays(habit) {
  const points = [habit.startDate, ...habit.relapses.map(r => r.time), new Date().toISOString()];
  let max = 0;
  for (let i = 1; i < points.length; i++) {
    const gapDays = daysSince(points[i - 1], new Date(points[i]).getTime());
    if (gapDays > max) max = gapDays;
  }
  return Math.floor(max);
}

function countRelapses(habit, days) {
  if (days == null) return habit.relapses.length;
  return habit.relapses.filter(r => withinDays(r.time, days)).length;
}

function renderBadHabits() {
  const container = document.getElementById('badHabitsList');
  container.innerHTML = '';
  Object.entries(DATA.habits).forEach(([key, habit]) => {
    const start = streakStart(habit);
    const ms = Date.now() - new Date(start).getTime();
    const days = Math.floor(ms / DAY_MS);
    const hours = Math.floor((ms % DAY_MS) / (60 * 60 * 1000));
    const record = recordStreakDays(habit);
    const streakDaysFloat = ms / DAY_MS;

    const card = document.createElement('div');
    card.className = 'card habit-card';

    let savingsHtml = '';
    if (habit.costPerDay > 0) {
      const saved = round(habit.costPerDay * streakDaysFloat);
      savingsHtml = `<div class="habit-savings">Зекономлено: ${saved} ${DATA.settings.currency}</div>`;
    }

    card.innerHTML = `
      <div class="habit-title">${habit.name}</div>
      <div class="habit-timer">
        <span class="big">${days}</span><span class="unit">дн</span>
        <span class="big">${hours}</span><span class="unit">год</span>
      </div>
      <div class="habit-sub">Рекорд: ${record} дн · ${motivationalMessage(streakDaysFloat)}</div>
      <div class="habit-counts">
        <div><b>${countRelapses(habit, 7)}</b><span>тиждень</span></div>
        <div><b>${countRelapses(habit, 30)}</b><span>місяць</span></div>
        <div><b>${countRelapses(habit)}</b><span>всього</span></div>
      </div>
      ${savingsHtml}
      <div class="habit-actions">
        <button class="btn-danger" data-relapse="${key}">Зірвався</button>
        <button class="btn-secondary" data-undo="${key}">Скасувати</button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('[data-relapse]').forEach(btn => {
    btn.addEventListener('click', () => {
      DATA.habits[btn.dataset.relapse].relapses.push({ time: new Date().toISOString(), note: '' });
      persist();
      renderBadHabits();
      renderSummary();
    });
  });
  container.querySelectorAll('[data-undo]').forEach(btn => {
    btn.addEventListener('click', () => {
      DATA.habits[btn.dataset.undo].relapses.pop();
      persist();
      renderBadHabits();
      renderSummary();
    });
  });
}

// ---------- activity (treadmill) ----------

function setupHabitHandlers() {
  document.getElementById('tmSubmit').addEventListener('click', () => {
    const min = parseFloat(document.getElementById('tmMin').value);
    if (!min) return;
    const speed = parseFloat(document.getElementById('tmSpeed').value) || 0;
    let steps = parseFloat(document.getElementById('tmSteps').value) || 0;
    let kcal = parseFloat(document.getElementById('tmKcal').value) || 0;
    const distanceKm = speed > 0 ? round(speed * (min / 60), 2) : 0;
    const weight = DATA.profile.weightKg || 80;
    if (!kcal) kcal = Math.round((distanceKm > 0 ? distanceKm * weight * 0.9 : min * weight * 0.06));
    if (!steps && distanceKm > 0) steps = Math.round(distanceKm * 1500);

    DATA.activities.treadmill.sessions.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      durationMin: min,
      speedKmh: speed,
      distanceKm,
      steps,
      kcal
    });
    persist();
    document.getElementById('tmMin').value = '';
    document.getElementById('tmSpeed').value = '';
    document.getElementById('tmSteps').value = '';
    document.getElementById('tmKcal').value = '';
    renderActivity();
    renderCalories();
  });

  document.getElementById('delSubmit').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('delAmount').value);
    if (!amount) return;
    DATA.expenses.delivery.entries.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      amount
    });
    persist();
    document.getElementById('delAmount').value = '';
    renderExpenses();
    renderSummary();
  });
}

function aggregate(items, days, getVal) {
  const filtered = days == null ? items : items.filter(i => withinDays(i.time, days));
  return filtered.reduce((sum, i) => sum + getVal(i), 0);
}

function renderActivity() {
  const sessions = DATA.activities.treadmill.sessions;
  const body = document.getElementById('tmStatsBody');
  const rows = [
    ['Тиждень', 7],
    ['Місяць', 30],
    ['Весь час', null]
  ];
  body.innerHTML = rows.map(([label, days]) => {
    const kcal = round(aggregate(sessions, days, s => s.kcal));
    const km = round(aggregate(sessions, days, s => s.distanceKm), 1);
    const min = round(aggregate(sessions, days, s => s.durationMin));
    const steps = round(aggregate(sessions, days, s => s.steps));
    return `<tr><td>${label}</td><td>${kcal}</td><td>${km}</td><td>${min}</td><td>${steps}</td></tr>`;
  }).join('');

  const recent = document.getElementById('tmRecent');
  const sorted = [...sessions].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);
  recent.innerHTML = sorted.map(s => `
    <div class="recent-item">
      <span>${fmtDateTime(s.time)} — ${s.durationMin}хв, ${s.distanceKm}км/${s.speedKmh}км/год</span>
      <span class="meta">${s.kcal} ккал <button class="del" data-del-session="${s.id}">×</button></span>
    </div>
  `).join('');

  recent.querySelectorAll('[data-del-session]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delSession;
      DATA.activities.treadmill.sessions = sessions.filter(s => s.id !== id);
      persist();
      renderActivity();
      renderCalories();
    });
  });
}

function renderExpenses() {
  const entries = DATA.expenses.delivery.entries;
  const body = document.getElementById('delStatsBody');
  const rows = [
    ['Тиждень', 7],
    ['Місяць', 30],
    ['Весь час', null]
  ];
  body.innerHTML = rows.map(([label, days]) => {
    const sum = round(aggregate(entries, days, e => e.amount));
    const count = days == null ? entries.length : entries.filter(e => withinDays(e.time, days)).length;
    return `<tr><td>${label}</td><td>${sum} ${DATA.settings.currency}</td><td>${count}</td></tr>`;
  }).join('');
}

// ---------- calories ----------

function computeBmr(p) {
  if (!p.age || !p.heightCm || !p.weightKg) return null;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'female' ? base - 161 : base + 5;
}

function todayEntries() {
  return DATA.calories[todayKey()] || [];
}

function dayBurned(key) {
  return DATA.activities.treadmill.sessions
    .filter(s => todayKey(new Date(s.time)) === key)
    .reduce((sum, s) => sum + s.kcal, 0);
}

function todayBurned() {
  return dayBurned(todayKey());
}

function setupCalorieHandlers() {
  document.getElementById('manualToggle').addEventListener('click', () => {
    document.getElementById('manualForm').classList.toggle('open');
  });

  document.getElementById('manSubmit').addEventListener('click', () => {
    const kcal = parseFloat(document.getElementById('manKcal').value);
    if (!kcal) return;
    const text = document.getElementById('mealText').value.trim();
    const key = todayKey();
    if (!DATA.calories[key]) DATA.calories[key] = [];
    DATA.calories[key].push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      text: text || 'Введено вручну',
      kcal: Math.round(kcal),
      protein: Math.round(parseFloat(document.getElementById('manProtein').value) || 0),
      carbs: Math.round(parseFloat(document.getElementById('manCarbs').value) || 0),
      fat: Math.round(parseFloat(document.getElementById('manFat').value) || 0),
      fiber: Math.round(parseFloat(document.getElementById('manFiber').value) || 0),
      junk: document.getElementById('manJunk').checked
    });
    persist();
    ['mealText', 'manKcal', 'manProtein', 'manCarbs', 'manFat', 'manFiber'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('manJunk').checked = false;
    document.getElementById('manualForm').classList.remove('open');
    renderCalories();
  });

  document.getElementById('mealSubmit').addEventListener('click', async () => {
    const text = document.getElementById('mealText').value.trim();
    const errorEl = document.getElementById('mealError');
    errorEl.textContent = '';
    if (!text) return;
    const btn = document.getElementById('mealSubmit');
    btn.disabled = true;
    btn.textContent = 'Аналізую...';
    try {
      const apiKey = DATA.settings.geminiApiKey;
      const result = await window.api.analyzeMeal(apiKey, text);
      const key = todayKey();
      if (!DATA.calories[key]) DATA.calories[key] = [];
      DATA.calories[key].push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        time: new Date().toISOString(),
        text,
        kcal: Math.round(result.kcal || 0),
        protein: Math.round(result.protein || 0),
        carbs: Math.round(result.carbs || 0),
        fat: Math.round(result.fat || 0),
        fiber: Math.round(result.fiber || 0),
        junk: !!result.junk
      });
      persist();
      document.getElementById('mealText').value = '';
      renderCalories();
    } catch (err) {
      errorEl.textContent = 'Помилка: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Оцінити через ШІ';
    }
  });
}

function macroBarRow(label, value, target) {
  const pct = target > 0 ? Math.min(100, round((value / target) * 100)) : 0;
  return `
    <div class="macro-bar">
      <div class="macro-bar-top"><span>${label}</span><span class="macro-val">${value}/${target}г</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

function renderCalories() {
  const entries = todayEntries();
  const consumed = round(entries.reduce((s, e) => s + e.kcal, 0));
  const protein = round(entries.reduce((s, e) => s + e.protein, 0));
  const carbs = round(entries.reduce((s, e) => s + e.carbs, 0));
  const fat = round(entries.reduce((s, e) => s + e.fat, 0));
  const fiber = round(entries.reduce((s, e) => s + e.fiber, 0));
  const burned = todayBurned();

  const p = DATA.profile;
  const bmr = computeBmr(p);
  const card = document.getElementById('calSummaryCard');

  if (!bmr) {
    card.innerHTML = `
      <div class="cal-kcal-row"><span class="cal-current">${consumed}</span> ккал</div>
      <div class="cal-norm">Заповни профіль у Налаштуваннях для розрахунку мети й норми.</div>
    `;
  } else {
    const tdee = bmr * (p.activityLevel || 1.2);
    const baseGoal = tdee - (p.deficit || 0);
    const goal = round(baseGoal + burned);
    const norm = round(tdee + burned);
    const toDeficit = round(goal - consumed);
    const toNorm = round(norm - consumed);

    const proteinTarget = round((p.weightKg || 0) * 1.8);
    const fatTarget = round((goal * 0.25) / 9);
    const carbsTarget = Math.max(0, round((goal - proteinTarget * 4 - fatTarget * 9) / 4));

    let weightRow = '';
    if (p.weightKg && p.goalWeightKg) {
      const remaining = round(Math.abs(p.weightKg - p.goalWeightKg), 1);
      weightRow = `<div class="weight-row">Вага ${p.weightKg} → ціль ${p.goalWeightKg} кг (залишилось ${remaining} кг)</div>`;
    }

    card.innerHTML = `
      <div class="cal-kcal-row"><span class="cal-current">${consumed}</span> ккал</div>
      <div class="cal-norm">мета ${goal} (${round(baseGoal)}+${burned}) · норма ${norm} (${round(tdee)}+${burned})</div>
      <div class="cal-remaining"><span>До дефіциту: ${toDeficit} ккал</span><span>До норми: ${toNorm} ккал</span></div>
      ${burned > 0 ? `<div class="cal-burned">Спалено сьогодні: ${burned} ккал (доріжка)</div>` : ''}
      ${macroBarRow('Білки', protein, proteinTarget)}
      ${macroBarRow('Жири', fat, fatTarget)}
      ${macroBarRow('Вуглеводи', carbs, carbsTarget)}
      <div class="fiber-row"><span>Клітковина</span><span>${fiber}г</span></div>
      ${weightRow}
    `;

    renderRecommendation({ toNorm, toDeficit, proteinLeft: proteinTarget - protein, fatLeft: fatTarget - fat, carbsLeft: carbsTarget - carbs });
  }

  const mealEntries = document.getElementById('mealEntries');
  mealEntries.innerHTML = [...entries].reverse().map(e => `
    <div class="meal-entry ${e.junk ? 'junk' : ''}">
      <div class="meal-top"><span>${fmtDateTime(e.time)}</span><span class="kcal">${e.kcal} ккал</span></div>
      <div class="meal-macros">Б${e.protein} Ж${e.fat} В${e.carbs} Клітк${e.fiber}${e.junk ? ' · шкідливе' : ''}</div>
      <div class="meal-text">${escapeHtml(e.text)}</div>
    </div>
  `).join('');

  renderJunkStats();
  renderCalChart();
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function allCalorieEntries() {
  return Object.values(DATA.calories).flat();
}

function renderRecommendation(ctx) {
  const el = document.getElementById('recoText');
  if (ctx.toNorm <= 0) {
    el.textContent = 'Денна норма вже досягнута. На сьогодні їжі більше не потрібно.';
    return;
  }
  const parts = [];
  if (ctx.proteinLeft > 10) parts.push(`ще ~${Math.round(ctx.proteinLeft)}г білка`);
  if (ctx.carbsLeft > 10) parts.push(`~${Math.round(ctx.carbsLeft)}г вуглеводів`);
  if (ctx.fatLeft > 5) parts.push(`~${Math.round(ctx.fatLeft)}г жирів`);
  const macroHint = parts.length ? `Бракує: ${parts.join(', ')}.` : '';
  el.textContent = `Залишилось ${Math.round(ctx.toNorm)} ккал до норми. ${macroHint}`;
}

function renderJunkStats() {
  const all = allCalorieEntries().filter(e => e.junk);
  const week = all.filter(e => withinDays(e.time, 7)).length;
  const month = all.filter(e => withinDays(e.time, 30)).length;
  document.getElementById('junkCounts').innerHTML = `
    <div><b>${week}</b><span>тиждень</span></div>
    <div><b>${month}</b><span>місяць</span></div>
    <div><b>${all.length}</b><span>всього</span></div>
  `;
  const last = [...all].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
  document.getElementById('junkLast').textContent = last ? `Востаннє: ${fmtDate(last.time)}` : 'Ще не було';
}

function renderCalChart() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS);
    days.push(todayKey(d));
  }
  const totals = days.map(k => (DATA.calories[k] || []).reduce((s, e) => s + e.kcal, 0));
  const max = Math.max(1, ...totals);
  const bmr = computeBmr(DATA.profile);
  const tdee = bmr ? bmr * (DATA.profile.activityLevel || 1.2) : null;
  const chart = document.getElementById('calChart');
  chart.innerHTML = days.map((k, i) => {
    const val = totals[i];
    const pct = val > 0 ? Math.max(4, round((val / max) * 100)) : 2;
    const dayLabel = String(new Date(k).getDate()).padStart(2, '0');
    let title = `${k}: ${val} ккал`;
    if (tdee && val > 0) {
      const norm = tdee + dayBurned(k);
      const deltaKg = round((norm - val) / 7700, 2);
      if (deltaKg > 0) title += ` · схуд ~${deltaKg} кг`;
      else if (deltaKg < 0) title += ` · набрав ~${Math.abs(deltaKg)} кг`;
    }
    return `
      <div class="bar-col" title="${title}">
        <div class="bar-shape ${val > 0 ? 'has-data' : ''}" style="height:${pct}%"></div>
        <div class="bar-label">${dayLabel}</div>
      </div>
    `;
  }).join('');
}

// ---------- summary ----------

function setupSummaryHandlers() {
  document.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      summaryPeriod = btn.dataset.period;
      document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSummary();
    });
  });
}

function renderSummary() {
  const kazik = DATA.habits.kazik;
  const streakDaysFloat = kazik ? daysSince(streakStart(kazik)) : 0;
  const saved = kazik ? round(kazik.costPerDay * streakDaysFloat) : 0;
  document.getElementById('kazikSaved').textContent = `+${saved} ${DATA.settings.currency}`;

  const periodDays = summaryPeriod === 'week' ? 7 : 30;
  const periodLabel = summaryPeriod === 'week' ? 'тиждень' : 'місяць';
  document.getElementById('periodLabel').textContent = periodLabel;

  const spent = round(aggregate(DATA.expenses.delivery.entries, periodDays, e => e.amount));
  document.getElementById('deliverySpent').textContent = `-${spent} ${DATA.settings.currency}`;
}

// ---------- settings ----------

function setupSettingsHandlers() {
  const el = id => document.getElementById(id);

  const bind = (id, path, isNumber, isCheckbox) => {
    el(id).addEventListener('change', () => {
      let val = isCheckbox ? el(id).checked : el(id).value;
      if (isNumber && !isCheckbox) val = val === '' ? null : parseFloat(val);
      setPath(DATA, path, val);
      persist();
      if (path === 'settings.autoLaunch') window.api.setAutoLaunch(val);
      renderAll();
    });
  };

  bind('setGeminiKey', 'settings.geminiApiKey', false, false);
  bind('setSex', 'profile.sex', false, false);
  bind('setAge', 'profile.age', true, false);
  bind('setHeight', 'profile.heightCm', true, false);
  bind('setWeight', 'profile.weightKg', true, false);
  bind('setGoalWeight', 'profile.goalWeightKg', true, false);
  bind('setDeficit', 'profile.deficit', true, false);
  bind('setActivity', 'profile.activityLevel', true, false);
  bind('setCurrency', 'settings.currency', false, false);
  bind('setKalyanCost', 'habits.kalyan.costPerDay', true, false);
  bind('setKazikCost', 'habits.kazik.costPerDay', true, false);
  bind('setAutoLaunch', 'settings.autoLaunch', false, true);

  el('btnOpenFolder').addEventListener('click', () => window.api.openFolder());
  el('btnExport').addEventListener('click', () => window.api.exportData());
  el('btnImport').addEventListener('click', async () => {
    const result = await window.api.importData();
    if (result) {
      DATA = result;
      renderAll();
    }
  });
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function renderSettings() {
  const el = id => document.getElementById(id);
  el('setGeminiKey').value = DATA.settings.geminiApiKey || '';
  el('setSex').value = DATA.profile.sex || 'male';
  el('setAge').value = DATA.profile.age ?? '';
  el('setHeight').value = DATA.profile.heightCm ?? '';
  el('setWeight').value = DATA.profile.weightKg ?? '';
  el('setGoalWeight').value = DATA.profile.goalWeightKg ?? '';
  el('setDeficit').value = DATA.profile.deficit ?? '';
  el('setActivity').value = DATA.profile.activityLevel ?? 1.2;
  el('setCurrency').value = DATA.settings.currency || '₴';
  el('setKalyanCost').value = DATA.habits.kalyan?.costPerDay ?? 0;
  el('setKazikCost').value = DATA.habits.kazik?.costPerDay ?? 0;
  el('setAutoLaunch').checked = !!DATA.settings.autoLaunch;
}

init();
