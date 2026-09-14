/* Block Pacer — CMU dining plan pacing */
(() => {
'use strict';

/* ---------- data (2026–27 dining agreements + academic calendar) ---------- */
const PLANS = [
  { id: 'green',      name: 'Green',             group: 'Traditional', blocks: 292, flex: 280, priceFY: 4422, priceUC: 4314 },
  { id: 'blue',       name: 'Blue',              group: 'Traditional', blocks: 252, flex: 540, priceFY: 4191, priceUC: 4084 },
  { id: 'red',        name: 'Red',               group: 'Traditional', blocks: 205, flex: 880, priceFY: 3975, priceUC: 3868 },
  { id: 'yellow',     name: 'Yellow',            group: 'Traditional', blocks: 125, flex: 195, priceFY: 1992, priceUC: 1884 },
  { id: 'tartanflex', name: 'Tartan Flex',       group: 'Community',   blocks: 170, flex: 915, priceUC: 3373 },
  { id: 'scottys',    name: "Scotty's Choice",   group: 'Community',   blocks: 85,  flex: 655, priceUC: 1929 },
  { id: 'whitfields', name: "Whitfield's Favor", group: 'Community',   blocks: 54,  flex: 500, priceUC: 1317 },
  { id: 'piper',      name: 'Piper Select',      group: 'Community',   blocks: 32,  flex: 350, priceUC: 854 },
  { id: 'custom',     name: 'Custom / other',    group: 'Other' },
];

const SEMESTERS = {
  fall2026: {
    name: 'Fall 2026', start: '2026-08-23', end: '2026-12-14',
    lastClass: '2026-12-04', changeDeadline: '2026-09-18',
    breaks: [
      { id: 'fallbreak', name: 'Fall Break', options: [
        { label: 'On campus', from: null, to: null },
        { label: 'Away Mon–Fri (Oct 12–16)', from: '2026-10-12', to: '2026-10-16' },
        { label: 'Away Sat–Sun (Oct 10–18)', from: '2026-10-10', to: '2026-10-18' },
      ]},
      { id: 'thanksgiving', name: 'Thanksgiving', options: [
        { label: 'On campus', from: null, to: null },
        { label: 'Away Wed–Sun (Nov 25–29)', from: '2026-11-25', to: '2026-11-29' },
        { label: 'Away Sat–Sun (Nov 21–29)', from: '2026-11-21', to: '2026-11-29' },
      ]},
    ],
  },
  spring2027: {
    name: 'Spring 2027', start: '2027-01-10', end: '2027-05-04',
    lastClass: '2027-04-30', changeDeadline: null,
    breaks: [
      { id: 'springbreak', name: 'Spring Break', options: [
        { label: 'On campus', from: null, to: null },
        { label: 'Away Mon–Fri (Mar 8–12)', from: '2027-03-08', to: '2027-03-12' },
        { label: 'Away Sat–Sun (Mar 6–14)', from: '2027-03-06', to: '2027-03-14' },
      ]},
    ],
  },
};

const STORE_KEY = 'blockpacer.v1';

/* ---------- helpers ---------- */
const DAY = 86400000;
const $ = (s, el = document) => el.querySelector(s);
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toISO = t => new Date(t).toISOString().slice(0, 10);
const addDays = (t, n) => t + n * DAY;
const dow = t => new Date(t).getUTCDay();
const fmt = (t, opts = { month: 'short', day: 'numeric' }) => new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const todayUTC = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
const money0 = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const money2 = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n, d = 1) => n.toLocaleString('en-US', { maximumFractionDigits: d });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function defaultAsOf(sem) {
  const t = todayUTC(), s = parseISO(sem.start), e = parseISO(sem.end);
  return toISO(Math.min(Math.max(t, s), e));
}

function defaults() {
  const sem = SEMESTERS.fall2026;
  return {
    semester: 'fall2026', plan: 'blue', firstYear: false,
    customBlocks: 200, customFlex: 500, customPrice: '',
    blocksLeft: 198, flexLeft: 455,
    asOf: defaultAsOf(sem), lastDay: sem.end,
    breaks: { fallbreak: '0', thanksgiving: '1' },
    metric: 'blocks', example: true,
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return defaults();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

/* ---------- plan + calendar resolution ---------- */
function currentPlan() {
  const p = PLANS.find(p => p.id === state.plan) || PLANS[1];
  if (p.id === 'custom') {
    const price = Number(state.customPrice);
    return { ...p, blocks: Number(state.customBlocks) || 0, flex: Number(state.customFlex) || 0, price: price > 0 ? price : null };
  }
  const price = state.firstYear && p.priceFY ? p.priceFY : p.priceUC;
  return { ...p, price };
}

function awayRanges(sem) {
  const out = [];
  for (const b of sem.breaks) {
    const opt = b.options[Number(state.breaks[b.id] || 0)];
    if (opt && opt.from) out.push({ name: b.name, from: parseISO(opt.from), to: parseISO(opt.to) });
  }
  return out;
}

/* ---------- core model ---------- */
function compute() {
  const sem = SEMESTERS[state.semester] || SEMESTERS.fall2026;
  const plan = currentPlan();
  const semStart = parseISO(sem.start), semEnd = parseISO(sem.end);
  const asOf = parseISO(state.asOf), lastDay = parseISO(state.lastDay);
  const errors = [];
  if (isNaN(asOf) || isNaN(lastDay)) errors.push('Enter both dates.');
  if (!errors.length) {
    if (asOf < semStart || asOf > semEnd) errors.push(`"As of" must fall between ${fmt(semStart)} and ${fmt(semEnd)} for ${sem.name}.`);
    if (lastDay > semEnd) errors.push(`Your plan expires ${fmt(semEnd)}; the last day can't be later than that.`);
    if (lastDay < asOf) errors.push('Your last day on campus is before the "as of" date.');
  }
  const blocksLeft = Number(state.blocksLeft), flexLeft = Number(state.flexLeft);
  if (!(blocksLeft >= 0)) errors.push('Blocks left must be 0 or more.');
  if (!(flexLeft >= 0)) errors.push('FLEX left must be 0 or more.');
  if (plan.blocks > 0 && blocksLeft > plan.blocks) errors.push(`You can't have more than ${plan.blocks} blocks on the ${plan.name} plan.`);
  if (plan.flex > 0 && flexLeft > plan.flex) errors.push(`You can't have more than $${plan.flex} FLEX on the ${plan.name} plan.`);
  if (errors.length) return { errors, sem, plan };

  const away = awayRanges(sem);
  const isAway = t => away.some(r => t >= r.from && t <= r.to);
  const days = [];      // every day of the plan period
  const nDays = Math.round((semEnd - semStart) / DAY) + 1;
  let cumAll = 0;
  for (let i = 0; i < nDays; i++) {
    const t = addDays(semStart, i);
    const eating = t <= lastDay && !isAway(t);
    if (eating) cumAll++;
    days.push({ t, eating, away: isAway(t), cum: cumAll });
  }
  const idx = t => Math.round((t - semStart) / DAY);
  const eatingBetween = (a, b) => { // inclusive
    if (b < a) return 0;
    const ia = Math.max(0, idx(a)), ib = Math.min(nDays - 1, idx(b));
    return days[ib].cum - (ia > 0 ? days[ia - 1].cum : 0);
  };

  const totalEating = cumAll;
  const E = eatingBetween(asOf, lastDay);              // eating days left, today included
  const elapsedE = eatingBetween(semStart, addDays(asOf, -1));
  const calDaysLeft = Math.round((lastDay - asOf) / DAY) + 1;

  const vpb = plan.price ? (plan.price - plan.flex) / plan.blocks : null;

  const metric = (S, R, cap) => {
    const used = Math.max(0, S - R);
    const rate = elapsedE > 0 ? used / elapsedE : null;
    const perDay = E > 0 ? R / E : null;
    const perWeek = perDay === null ? null : perDay * 7;
    const capTotal = cap ? cap * E : Infinity;
    const unsavable = Math.max(0, R - capTotal);
    let projectedLeft = null, runOut = null;
    if (rate !== null) {
      projectedLeft = R - rate * E;
      if (projectedLeft < 0 && rate > 0) {
        let acc = 0, t = asOf;
        while (t <= lastDay) { if (days[idx(t)].eating) { acc += rate; if (acc >= R) break; } t = addDays(t, 1); }
        runOut = Math.min(t, lastDay);
      }
    }
    // status
    let status = 'info', tol = perDay === null ? 0 : Math.max(perDay * 7, S * 0.02);
    if (unsavable > 0) status = 'crit';
    else if (R === 0) status = 'good';
    else if (rate === null || elapsedE < 5) status = 'info';
    else if (projectedLeft > tol) status = 'warn';
    else if (projectedLeft < -tol) status = 'warn';
    else status = 'good';
    return { S, R, used, rate, perDay, perWeek, cap, unsavable, projectedLeft, runOut, status, tol };
  };

  const blocks = metric(plan.blocks, blocksLeft, 4);
  const flex = metric(plan.flex, flexLeft, null);

  /* weeks: Sunday–Saturday */
  const weeks = [];
  let wkStart = addDays(semStart, -dow(semStart));
  const rangeEnd = lastDay;
  while (wkStart <= rangeEnd) {
    const wkEnd = addDays(wkStart, 6);
    const a = Math.max(wkStart, semStart), b = Math.min(wkEnd, rangeEnd);
    const isPast = b < asOf;
    const isNow = asOf >= wkStart && asOf <= wkEnd;
    const from = Math.max(a, asOf), to = b;
    const eatDays = isPast ? 0 : eatingBetween(from, to);
    const calDays = isPast ? 0 : Math.max(0, Math.round((to - from) / DAY) + 1);
    const awayNames = [...new Set(away.filter(r => r.to >= a && r.from <= b).map(r => r.name))];
    weeks.push({ start: wkStart, end: wkEnd, a, b, isPast, isNow, eatDays, calDays, awayNames });
    wkStart = addDays(wkStart, 7);
  }
  const alloc = (total, decimals) => {
    const future = weeks.filter(w => !w.isPast);
    const sumDays = future.reduce((s, w) => s + w.eatDays, 0);
    const scale = Math.pow(10, decimals);
    const units = Math.round(total * scale);
    if (sumDays === 0) return weeks.map(() => 0);
    const raw = future.map(w => units * w.eatDays / sumDays);
    const floors = raw.map(Math.floor);
    let rem = units - floors.reduce((s, x) => s + x, 0);
    const order = raw.map((r, i) => [r - floors[i], i]).sort((x, y) => y[0] - x[0]);
    for (let k = 0; k < order.length && rem > 0; k++) { floors[order[k][1]]++; rem--; }
    const out = weeks.map(() => 0); let j = 0;
    weeks.forEach((w, i) => { if (!w.isPast) out[i] = floors[j++] / scale; });
    return out;
  };
  const wkBlocks = alloc(blocksLeft, 0), wkFlex = alloc(flexLeft, 2);
  weeks.forEach((w, i) => { w.blocks = wkBlocks[i]; w.flex = wkFlex[i]; });

  return { errors: [], sem, plan, semStart, semEnd, asOf, lastDay, away, days, nDays, idx, eatingBetween, totalEating, E, elapsedE, calDaysLeft, vpb, blocks, flex, weeks };
}

/* ---------- rendering ---------- */
let builtSemester = null;
const setVal = (el, v) => { if (el !== document.activeElement && String(el.value) !== String(v)) el.value = v; };

function renderForm() {
  const semSel = $('#semester');
  if (!semSel.options.length) {
    semSel.innerHTML = Object.entries(SEMESTERS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
    const planSel = $('#plan');
    const groups = [...new Set(PLANS.map(p => p.group))];
    planSel.innerHTML = groups.map(g => `<optgroup label="${g}">` + PLANS.filter(p => p.group === g).map(p =>
      `<option value="${p.id}">${esc(p.name)}${p.blocks ? ` · ${p.blocks} blocks, $${p.flex} FLEX` : ''}</option>`).join('') + '</optgroup>').join('');
  }
  setVal(semSel, state.semester);
  setVal($('#plan'), state.plan);
  $('#firstYear').checked = !!state.firstYear;
  setVal($('#customBlocks'), state.customBlocks);
  setVal($('#customFlex'), state.customFlex);
  setVal($('#customPrice'), state.customPrice);
  $('#custom-fields').hidden = state.plan !== 'custom';
  setVal($('#blocksLeft'), state.blocksLeft);
  setVal($('#flexLeft'), state.flexLeft);
  setVal($('#asOf'), state.asOf);
  setVal($('#lastDay'), state.lastDay);
  const sem = SEMESTERS[state.semester];
  $('#asOf').min = sem.start; $('#asOf').max = sem.end;
  $('#lastDay').min = sem.start; $('#lastDay').max = sem.end;

  if (builtSemester !== state.semester) {
    $('#break-fields').innerHTML = sem.breaks.map(b => `
    <div class="field">
      <label for="brk-${b.id}">${b.name}</label>
      <select id="brk-${b.id}" data-break="${b.id}">${b.options.map((o, i) => `<option value="${i}">${o.label}</option>`).join('')}</select>
    </div>`).join('');
    builtSemester = state.semester;
  }
  sem.breaks.forEach(b => { setVal($(`#brk-${b.id}`), state.breaks[b.id] || '0'); });

  const plan = currentPlan();
  const price = plan.price ? `${money0(plan.price)} per semester` : 'price unknown';
  const vpb = plan.price && plan.blocks ? ` · about ${money2((plan.price - plan.flex) / plan.blocks)} per block after FLEX` : '';
  $('#plan-hint').textContent = plan.id === 'custom' ? 'Enter what your plan gives you each semester.' : `${plan.blocks} blocks + $${plan.flex} FLEX, ${price}${vpb}.`;
  $('#lastday-hint').textContent = `Plan expires ${fmt(parseISO(sem.end), { month: 'long', day: 'numeric' })}. Classes end ${fmt(parseISO(sem.lastClass))}; if you leave right after your last final, set that date here.`;
  $('#example-chip').hidden = !state.example;
  $('#semester-label').textContent = sem.name;
  $('#expiry-label').textContent = fmt(parseISO(sem.end), { month: 'short', day: 'numeric' });
  $('#seg-blocks').setAttribute('aria-pressed', String(state.metric === 'blocks'));
  $('#seg-flex').setAttribute('aria-pressed', String(state.metric === 'flex'));
}

function statusChip(status, text) {
  const cls = { good: 'chip-good', warn: 'chip-warn', crit: 'chip-crit', info: 'chip-info' }[status] || 'chip-info';
  return `<span class="chip ${cls}">${text}</span>`;
}

function renderVerdict(m) {
  const { blocks: b, flex: f, E, vpb, lastDay } = m;
  const tl = $('#target-line');
  if (E === 0) {
    tl.innerHTML = 'No campus days left before your last day.';
  } else {
    const bw = b.perWeek, fw = f.perWeek;
    const wkLeft = E / 7;
    const blockPhrase = wkLeft < 1 ? `<span class="n">${num(b.R, 0)} blocks</span>` : `<span class="n">${num(Math.min(bw, 28), 0)} blocks</span> a week`;
    const flexPhrase = wkLeft < 1 ? `<span class="n">${money2(f.R)}</span> of FLEX` : `<span class="n">${money0(fw)}</span> of FLEX a week`;
    const tail = b.unsavable > 0 ? `, and ${num(b.unsavable, 0)} blocks will expire no matter what.` : ' to finish clean.';
    tl.innerHTML = wkLeft < 1 ? `Spend ${blockPhrase} and ${flexPhrase} by ${fmt(lastDay)}${tail}` : `Spend ${blockPhrase} and ${flexPhrase}${tail}`;
  }

  const items = [];
  const paceLine = (x, label, isMoney) => {
    const fmtV = v => isMoney ? money0(v) : `${num(v, 0)} ${Math.round(v) === 1 ? 'block' : 'blocks'}`;
    if (x.unsavable > 0) {
      return statusChip('crit', 'Over cap') + `<span>${label}: at the 4-a-day cap you can only use ${num(x.cap * E, 0)} of your ${num(x.R, 0)} blocks before ${fmt(m.lastDay)}. <b>${num(x.unsavable, 0)} will expire</b>${vpb ? ` (about ${money0(x.unsavable * vpb)})` : ''}. Consider a later last day, or stop skipping dinner.</span>`;
    }
    if (x.R === 0) return statusChip('good', 'Done') + `<span>${label}: nothing left to spend.</span>`;
    if (x.rate === null || m.elapsedE < 5) {
      return statusChip('info', 'Too early') + `<span>${label}: fewer than five days of history, so there is no pace to judge yet. Follow the weekly target for now.</span>`;
    }
    const perDayNow = isMoney ? money2(x.rate) : num(x.rate, 2);
    const perWeekNow = isMoney ? money0(x.rate * 7) : num(x.rate * 7, 1);
    const used = isMoney ? money0(x.used) : num(x.used, 0);
    const soFar = `You've used ${used} in ${plural(m.elapsedE, 'campus day', 'campus days')}, about ${perWeekNow} a week`;
    if (x.projectedLeft > x.tol) {
      const wasted = isMoney ? money0(x.projectedLeft) : (vpb ? `${fmtV(x.projectedLeft)} (about ${money0(x.projectedLeft * vpb)})` : fmtV(x.projectedLeft));
      return statusChip('warn', 'Behind') + `<span>${label}: ${soFar}. At that pace <b>${wasted}</b> would still be on your card on ${fmt(m.lastDay)}. Step up to the weekly target${isMoney ? '' : ' — a second block at dinner is the easiest place to add one'}.</span>`;
    }
    if (x.projectedLeft < -x.tol) {
      return statusChip('warn', 'Ahead') + `<span>${label}: ${soFar}. At that pace you run out around <b>${fmt(x.runOut)}</b>, ${plural(Math.round((m.lastDay - x.runOut) / DAY), 'day', 'days')} early. Ease back to the weekly target.</span>`;
    }
    return statusChip('good', 'On pace') + `<span>${label}: ${soFar}. Keep it up and you finish within a week's worth of ${isMoney ? 'FLEX' : 'blocks'}.</span>`;
  };
  items.push(`<li>${paceLine(b, 'Blocks', false)}</li>`);
  items.push(`<li>${paceLine(f, 'FLEX', true)}</li>`);
  $('#pace-list').innerHTML = items.join('');
}

function renderTiles(m) {
  const { blocks: b, flex: f, E, calDaysLeft, vpb } = m;
  const over = b.perDay !== null && b.perDay > 4;
  const mealsHint = d => d === null ? '' : d <= 1.5 ? 'about one meal a day' : d <= 2.5 ? 'about two meals a day' : d <= 3.5 ? 'about three meals a day' : d <= 4 ? 'close to the 4-block daily cap' : 'above the 4-block daily cap';
  const tiles = [
    { k: 'Blocks per day', v: b.perDay === null ? '—' : num(b.perDay, 1), d: mealsHint(b.perDay), over },
    { k: 'Blocks per week', v: b.perWeek === null ? '—' : num(b.perWeek, 0), d: `${num(b.R, 0)} left over ${plural(E, 'campus day', 'campus days')}`, over },
    { k: 'FLEX per day', v: f.perDay === null ? '—' : money2(f.perDay), d: 'a coffee and a snack, roughly' },
    { k: 'FLEX per week', v: f.perWeek === null ? '—' : money0(f.perWeek), d: `${money2(f.R)} left${vpb ? ` · each block ≈ ${money2(vpb)}` : ''}` },
  ];
  $('#tiles').innerHTML = tiles.map(t => `<div class="tile${t.over ? ' over' : ''}"><span class="k">${t.k}</span><span class="v">${t.v}</span><span class="d">${t.d}</span></div>`).join('');
  $('#chart-sub').textContent = `${plural(calDaysLeft, 'calendar day', 'calendar days')} left, ${E} of them on campus.`;
}

function renderWeeks(m) {
  const tbody = $('#weeks tbody'), tfoot = $('#weeks tfoot');
  const rows = m.weeks.filter(w => !w.isPast || w.isNow);
  tbody.innerHTML = rows.map(w => {
    const cls = [w.isNow ? 'now' : '', w.eatDays === 0 ? 'away' : ''].filter(Boolean).join(' ');
    const label = `${fmt(w.a)} – ${fmt(w.b)}`;
    const notes = [];
    if (w.isNow) notes.push(w.a === m.asOf && m.asOf !== w.start ? `this week, from ${fmt(m.asOf, { weekday: 'short' })}` : 'this week');
    if (w.awayNames.length) notes.push(w.awayNames.join(', '));
    if (w.b === m.lastDay && m.lastDay !== m.semEnd) notes.push('you leave ' + fmt(m.lastDay, { weekday: 'short' }));
    if (w.b === m.semEnd) notes.push('plan expires ' + fmt(m.semEnd, { weekday: 'short' }));
    const perDay = w.eatDays ? num(w.blocks / w.eatDays, 1) : '—';
    return `<tr class="${cls}"><td><span class="week-dates">${label}</span>${notes.length ? `<span class="week-note">${notes.join(' · ')}</span>` : ''}</td><td class="num">${w.eatDays}${w.eatDays !== w.calDays ? ` <span class="week-note">of ${w.calDays}</span>` : ''}</td><td class="num big">${w.eatDays ? w.blocks : '—'}</td><td class="num">${perDay}</td><td class="num">${w.eatDays ? money2(w.flex) : '—'}</td></tr>`;
  }).join('');
  const totB = rows.reduce((s, w) => s + w.blocks, 0), totF = rows.reduce((s, w) => s + w.flex, 0), totD = rows.reduce((s, w) => s + w.eatDays, 0);
  tfoot.innerHTML = `<tr><td>Total</td><td class="num">${totD}</td><td class="num">${totB}</td><td class="num">${totD ? num(totB / totD, 1) : '—'}</td><td class="num">${money2(totF)}</td></tr>`;
}

function renderPlanFit(m) {
  const card = $('#planfit');
  const dl = m.sem.changeDeadline ? parseISO(m.sem.changeDeadline) : null;
  const eligible = dl && m.asOf <= dl && m.blocks.rate !== null && m.elapsedE >= 5;
  card.hidden = !eligible;
  if (!eligible) return;
  const needB = m.blocks.rate * m.totalEating, needF = m.flex.rate * m.totalEating;
  const daysToGo = Math.round((dl - m.asOf) / DAY);
  $('#planfit-sub').textContent = `You can change plans until 5 PM on ${fmt(dl, { weekday: 'long', month: 'short', day: 'numeric' })}${daysToGo === 0 ? ' (today)' : ` (${plural(daysToGo, 'day', 'days')} from your as-of date)`}. At your current pace you'd use about ${num(needB, 0)} blocks and ${money0(needF)} of FLEX over the whole semester.`;
  const candidates = PLANS.filter(p => p.blocks && (state.firstYear ? p.priceFY : true));
  const rows = candidates.map(p => {
    const price = state.firstYear && p.priceFY ? p.priceFY : p.priceUC;
    const vpb = (price - p.flex) / p.blocks;
    const leftB = p.blocks - needB, leftF = p.flex - needF;
    const short = leftB < -3 || leftF < -10;
    const waste = Math.max(0, leftB) * vpb + Math.max(0, leftF);
    return { p, price, leftB, leftF, short, waste };
  });
  const ok = rows.filter(r => !r.short);
  const best = ok.length ? ok.reduce((a, r) => r.waste < a.waste ? r : a) : rows.reduce((a, r) => (Math.min(r.leftB, 0) + Math.min(r.leftF, 0) / 15) > (Math.min(a.leftB, 0) + Math.min(a.leftF, 0) / 15) ? r : a);
  $('#fit-table tbody').innerHTML = rows.map(r => {
    const fit = r === best ? '<span class="chip chip-best">Best fit</span>' : r.short ? `<span class="chip chip-crit">Runs short</span>` : `<span class="chip chip-info">${money0(r.waste)} unused</span>`;
    const cur = r.p.id === state.plan ? ' <span class="week-note">current</span>' : '';
    return `<tr class="${r === best ? 'best' : ''}"><td>${esc(r.p.name)}${cur}</td><td class="num">${r.p.blocks}</td><td class="num">$${r.p.flex}</td><td class="num">${money0(r.price)}</td><td class="num${r.leftB < 0 ? ' short' : ''}">${r.leftB < 0 ? `${num(-r.leftB, 0)} short` : num(r.leftB, 0)}</td><td class="num${r.leftF < 0 ? ' short' : ''}">${r.leftF < 0 ? `${money0(-r.leftF)} short` : money0(r.leftF)}</td><td>${fit}</td></tr>`;
  }).join('');
}

/* ---------- chart ---------- */
let chartModel = null;
function renderChart(m) {
  const svg = $('#chart');
  const isFlex = state.metric === 'flex';
  const x = isFlex ? m.flex : m.blocks;
  const W = 640, H = 250, ml = 44, mr = 14, mt = 14, mb = 30;
  const iw = W - ml - mr, ih = H - mt - mb;
  const S = Math.max(x.S, 1);
  const X = t => ml + (m.idx(t) / (m.nDays - 1)) * iw;
  const Y = v => mt + ih - (Math.max(0, v) / S) * ih;

  // series per day
  const ideal = [], plan = [], pace = [];
  const cumAt = i => m.days[i].cum;
  const cumAsOf = m.idx(m.asOf) > 0 ? cumAt(m.idx(m.asOf) - 1) : 0;
  for (let i = 0; i < m.nDays; i++) {
    const t = m.days[i].t;
    ideal.push([t, x.S * (1 - cumAt(i) / Math.max(1, m.totalEating))]);
    if (t >= m.asOf) {
      const eaten = cumAt(i) - cumAsOf;
      plan.push([t, x.perDay === null ? x.R : Math.max(0, x.R - x.perDay * eaten)]);
      if (x.rate !== null) pace.push([t, Math.max(0, x.R - x.rate * eaten)]);
    }
  }
  const path = pts => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join('');

  // y ticks
  const step = niceStep(S / 4);
  const yt = []; for (let v = 0; v <= S + 1e-9; v += step) yt.push(v);
  // x ticks: first of each month + semester start
  const xt = [];
  for (let i = 0; i < m.nDays; i++) { const d = new Date(m.days[i].t); if (d.getUTCDate() === 1 || i === 0) xt.push(m.days[i].t); }

  const fmtV = v => isFlex ? '$' + Math.round(v) : Math.round(v);
  let out = '';
  out += `<g class="away">${m.away.map(r => `<rect x="${X(r.from).toFixed(1)}" y="${mt}" width="${(X(r.to) - X(r.from) + iw / (m.nDays - 1)).toFixed(1)}" height="${ih}"></rect>`).join('')}</g>`;
  out += `<g class="grid">${yt.map(v => `<line x1="${ml}" x2="${W - mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"></line>`).join('')}</g>`;
  out += `<g class="axis">${yt.map(v => `<text x="${ml - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmtV(v)}</text>`).join('')}`;
  out += xt.map(t => `<text x="${X(t).toFixed(1)}" y="${H - 10}" text-anchor="${t === m.semStart ? 'start' : 'middle'}">${fmt(t, { month: 'short' })}${t === m.semStart ? ' ' + new Date(t).getUTCDate() : ''}</text>`).join('') + '</g>';
  if (m.lastDay !== m.semEnd) out += `<g class="today"><line x1="${X(m.lastDay).toFixed(1)}" x2="${X(m.lastDay).toFixed(1)}" y1="${mt}" y2="${mt + ih}"></line><text x="${(X(m.lastDay) - 4).toFixed(1)}" y="${mt + 10}" text-anchor="end">leave ${fmt(m.lastDay)}</text></g>`;
  out += `<path class="ideal" d="${path(ideal)}"></path>`;
  if (pace.length) out += `<path class="pace" d="${path(pace)}"></path>`;
  out += `<path class="plan" d="${path(plan)}"></path>`;
  out += `<g class="today"><line x1="${X(m.asOf).toFixed(1)}" x2="${X(m.asOf).toFixed(1)}" y1="${mt}" y2="${mt + ih}"></line><circle cx="${X(m.asOf).toFixed(1)}" cy="${Y(x.R).toFixed(1)}" r="5"></circle><text x="${(X(m.asOf) + 8).toFixed(1)}" y="${(Y(x.R) - 8).toFixed(1)}">${fmtV(x.R)} left</text></g>`;
  out += `<g class="cross" id="cross" style="display:none"><line y1="${mt}" y2="${mt + ih}"></line><circle r="4" fill="var(--accent)"></circle><circle r="4" fill="var(--ink)"></circle></g>`;
  out += `<rect class="hit" id="hit" x="${ml}" y="${mt}" width="${iw}" height="${ih}"></rect>`;
  svg.innerHTML = svg.innerHTML.replace(/<\/desc>[\s\S]*$/, '</desc>') + out;
  chartModel = { m, x, X, Y, ideal, plan, pace, isFlex, ml, iw, fmtV };
  bindHover();
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
}
function bindHover() {
  const svg = $('#chart'), hit = $('#hit'), tip = $('#tooltip'), cross = $('#cross');
  const wrap = $('#chart-wrap');
  const move = ev => {
    const c = chartModel; if (!c) return;
    const rect = svg.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * (640 / rect.width);
    const frac = Math.min(1, Math.max(0, (px - c.ml) / c.iw));
    const i = Math.round(frac * (c.m.nDays - 1));
    const t = c.m.days[i].t;
    const idealV = c.ideal[i][1];
    const planPt = c.plan.find(p => p[0] === t), pacePt = c.pace.find(p => p[0] === t);
    const xx = c.X(t);
    cross.style.display = '';
    cross.querySelector('line').setAttribute('x1', xx); cross.querySelector('line').setAttribute('x2', xx);
    const [c1, c2] = cross.querySelectorAll('circle');
    if (planPt) { c1.setAttribute('cx', xx); c1.setAttribute('cy', c.Y(planPt[1])); c1.style.display = ''; } else c1.style.display = 'none';
    if (pacePt) { c2.setAttribute('cx', xx); c2.setAttribute('cy', c.Y(pacePt[1])); c2.style.display = ''; } else c2.style.display = 'none';
    const lines = [`<b>${fmt(t, { weekday: 'short', month: 'short', day: 'numeric' })}</b>${c.m.days[i].away ? ' · away' : ''}`];
    if (planPt) lines.push(`Target: ${c.fmtV(planPt[1])} left`);
    if (pacePt) lines.push(`Your pace: ${c.fmtV(pacePt[1])} left`);
    lines.push(`Day-one ideal: ${c.fmtV(idealV)}`);
    tip.innerHTML = lines.join('<br>');
    tip.hidden = false;
    const wrect = wrap.getBoundingClientRect();
    const left = (xx / 640) * rect.width + (rect.left - wrect.left);
    const top = ((planPt ? c.Y(planPt[1]) : c.Y(idealV)) / 250) * rect.height + (rect.top - wrect.top);
    tip.style.left = `${Math.min(Math.max(left, 90), wrect.width - 90)}px`;
    tip.style.top = `${top}px`;
  };
  const leave = () => { tip.hidden = true; cross.style.display = 'none'; };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
}

/* ---------- orchestration ---------- */
function render() {
  renderForm();
  const m = compute();
  const err = $('#form-error');
  if (m.errors.length) {
    err.hidden = false; err.textContent = m.errors.join(' ');
    return;
  }
  err.hidden = true;
  renderVerdict(m);
  renderTiles(m);
  renderChart(m);
  renderWeeks(m);
  renderPlanFit(m);
}

function bind() {
  const form = $('#form');
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  $('#reset').addEventListener('click', () => { state = defaults(); state.example = true; save(); render(); });
  $('#seg-blocks').addEventListener('click', () => { state.metric = 'blocks'; save(); render(); });
  $('#seg-flex').addEventListener('click', () => { state.metric = 'flex'; save(); render(); });
}
function onChange(ev) {
  const el = ev.target;
  if (!el || !el.id) return;
  if (el.dataset.break) { state.breaks[el.dataset.break] = el.value; }
  else if (el.type === 'checkbox') state[el.id] = el.checked;
  else if (el.id in state) state[el.id] = el.value;
  else return;
  if (el.id === 'semester') {
    const sem = SEMESTERS[state.semester];
    state.asOf = defaultAsOf(sem); state.lastDay = sem.end;
    state.breaks = Object.fromEntries(sem.breaks.map(b => [b.id, '0']));
  }
  if (['blocksLeft', 'flexLeft', 'plan', 'asOf', 'lastDay'].includes(el.id)) state.example = false;
  save();
  render();
}

bind();
render();
})();
