import { CM_PER_IN, KG_PER_LB, compute, weightedMA, bfCategory } from "./calc.js";

const ENTRIES_KEY = "bf.entries";
const SETTINGS_KEY = "bf.settings";
// Keys used by the pre-spec version of the app; migrated once on first load.
const LEGACY_ENTRIES_KEY = "bfTrackerEntries";
const LEGACY_SETTINGS_KEY = "bfTrackerSettings";

const SAVE_DELAY_MS = 500;
const SVG_NS = "http://www.w3.org/2000/svg";

// First-run defaults (REQUIREMENTS §5), stored metric.
const DEFAULTS = {
  male: {
    heightCm: 69 * CM_PER_IN,
    weightKg: 200 * KG_PER_LB,
    waistCm: 40 * CM_PER_IN,
    neckCm: 15.5 * CM_PER_IN,
    hipCm: null,
    age: 40,
  },
  female: {
    heightCm: 63 * CM_PER_IN,
    weightKg: 170 * KG_PER_LB,
    waistCm: 38 * CM_PER_IN,
    neckCm: 13.5 * CM_PER_IN,
    hipCm: 42 * CM_PER_IN,
    age: 40,
  },
};

let entries = [];
let settings = {};
let saveTimer = null;

// DOM
/** @returns {any} */
const $ = (id) => document.getElementById(id);
const bfCompEl = $("bfCompValue");
const bfWarningEl = $("bfWarning");
const bfDeltaEl = $("bfDelta");
const bfCategoryEl = $("bfCategory");
const dateInput = $("dateInput");
const waistInput = $("waistInput");
const weightInput = $("weightInput");
const sexInput = $("sexInput");
const unitToggle = $("unitToggle");
const neckInput = $("neckInput");
const hipField = $("hipField");
const hipInput = $("hipInput");
const heightUsRow = $("heightUsRow");
const heightFtInput = $("heightFtInput");
const heightInInput = $("heightInInput");
const heightCmField = $("heightCmField");
const heightCmInput = $("heightCmInput");
const ageInput = $("ageInput");
const historyTableBody = document.querySelector("#historyTable tbody");
const exportCsvBtn = $("exportCsvBtn");
const chartSvg = $("trendChart");

function init() {
  loadState();

  dateInput.value = today();
  const last = entries[entries.length - 1] ?? DEFAULTS[settings.sex];
  writeWeeklyFields(last.waistCm, last.weightKg);
  writeSettingsFields(settings);
  applySexUI();
  applyUnitsUI();

  update();
  renderHistory();
  renderChart();

  dateInput.addEventListener("change", onDateChange);
  for (const el of [waistInput, weightInput]) {
    el.addEventListener("input", onWeeklyInput);
  }
  for (const el of [neckInput, hipInput, heightFtInput, heightInInput, heightCmInput, ageInput]) {
    el.addEventListener("input", onSettingsInput);
  }
  sexInput.addEventListener("change", onSexChange);
  unitToggle.addEventListener("change", onUnitChange);
  exportCsvBtn.addEventListener("click", onExportCsv);

  // Don't lose a pending debounced save when the app is backgrounded/closed.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
  window.addEventListener("pagehide", flushSave);
}

// storage
function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (e.g. private mode); keep working in memory.
  }
}

function loadState() {
  migrateLegacy();
  const stored = readJSON(SETTINGS_KEY) ?? {};
  const sex = stored.sex === "female" ? "female" : "male";
  const { weightKg, waistCm, ...profile } = DEFAULTS[sex];
  settings = { units: "us", sex, ...profile, ...stored };
  if (sex === "female" && !settings.hipCm) settings.hipCm = DEFAULTS.female.hipCm;

  const list = readJSON(ENTRIES_KEY);
  entries = Array.isArray(list) ? list : [];
  entries.sort((a, b) => a.date.localeCompare(b.date));
}

function migrateLegacy() {
  if (localStorage.getItem(ENTRIES_KEY) !== null) return;

  const oldEntries = readJSON(LEGACY_ENTRIES_KEY);
  if (Array.isArray(oldEntries)) {
    writeJSON(
      ENTRIES_KEY,
      oldEntries.map((e) => ({
        date: e.date,
        sex: "male",
        waistCm: e.waistCm,
        neckCm: e.neckCm,
        hipCm: null,
        heightCm: e.heightM * 100,
        weightKg: e.weightKg,
        age: e.age,
        bmi: e.bmi,
        bfNavy: e.bfNavy,
        bfComp: e.bfComp,
      }))
    );
  }

  const old = readJSON(LEGACY_SETTINGS_KEY);
  if (old && localStorage.getItem(SETTINGS_KEY) === null) {
    const len = old.units === "metric" ? 1 : CM_PER_IN;
    writeJSON(SETTINGS_KEY, {
      units: old.units === "metric" ? "metric" : "us",
      sex: "male",
      heightCm: (old.lastHeightFt * 12 + old.lastHeightIn) * CM_PER_IN,
      neckCm: old.lastNeckIn * len,
      age: old.lastAge,
    });
  }
}

const saveSettings = () => writeJSON(SETTINGS_KEY, settings);
const saveEntries = () => writeJSON(ENTRIES_KEY, entries);

// units
const isUS = () => settings.units === "us";
const round1 = (v) => String(Math.round(v * 10) / 10);
const show = (v) => (v == null || !Number.isFinite(v) ? "" : round1(v));
const lenOut = (cm) => show(cm == null ? cm : isUS() ? cm / CM_PER_IN : cm);
const massOut = (kg) => show(kg == null ? kg : isUS() ? kg / KG_PER_LB : kg);
const lenIn = (v) => (isUS() ? v * CM_PER_IN : v);
const massIn = (v) => (isUS() ? v * KG_PER_LB : v);
const num = (el) => (el.value === "" ? NaN : Number(el.value));

// Exact metric value behind each rounded field, so toggling units doesn't
// drift; used until the user edits the field.
const exact = new WeakMap();

function put(el, text, metric) {
  el.value = text;
  exact.set(el, { text, metric });
}

function take(el, fromDisplay) {
  const e = exact.get(el);
  return e && e.text === el.value ? e.metric : fromDisplay(num(el));
}

function readHeightCm() {
  if (!isUS()) return take(heightCmInput, Number);
  const ft = exact.get(heightFtInput);
  const inch = exact.get(heightInInput);
  if (ft?.text === heightFtInput.value && inch?.text === heightInInput.value) return ft.metric;
  const inches = heightInInput.value === "" ? 0 : num(heightInInput);
  return (num(heightFtInput) * 12 + inches) * CM_PER_IN;
}

function writeHeight(cm) {
  put(heightCmInput, show(cm), cm);
  if (cm == null || !Number.isFinite(cm)) {
    put(heightFtInput, "", cm);
    put(heightInInput, "", cm);
    return;
  }
  const totalIn = Math.round((cm / CM_PER_IN) * 10) / 10;
  const ft = Math.floor(totalIn / 12);
  put(heightFtInput, String(ft), cm);
  put(heightInInput, round1(totalIn - ft * 12), cm);
}

function writeWeeklyFields(waistCm, weightKg) {
  put(waistInput, lenOut(waistCm), waistCm);
  put(weightInput, massOut(weightKg), weightKg);
}

function writeSettingsFields(p) {
  sexInput.value = settings.sex;
  unitToggle.value = settings.units;
  put(neckInput, lenOut(p.neckCm), p.neckCm);
  put(hipInput, lenOut(p.hipCm), p.hipCm);
  writeHeight(p.heightCm);
  ageInput.value = show(p.age);
}

function applySexUI() {
  hipField.hidden = settings.sex !== "female";
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-sex]"))) {
    el.hidden = el.dataset.sex !== settings.sex;
  }
}

function applyUnitsUI() {
  const us = isUS();
  heightUsRow.hidden = !us;
  heightCmField.hidden = us;
  for (const el of document.querySelectorAll('[data-unit="len"]')) el.textContent = us ? "in" : "cm";
  for (const el of document.querySelectorAll('[data-unit="mass"]')) el.textContent = us ? "lb" : "kg";
}

// form → metric measurement
function readMeasurement() {
  const female = settings.sex === "female";
  return {
    date: dateInput.value,
    sex: settings.sex,
    waistCm: take(waistInput, lenIn),
    neckCm: take(neckInput, lenIn),
    hipCm: female ? take(hipInput, lenIn) : null,
    heightCm: readHeightCm(),
    weightKg: take(weightInput, massIn),
    age: num(ageInput),
  };
}

function update() {
  const m = readMeasurement();
  const result = compute(m);
  bfCompEl.textContent = result ? `${result.bfComp.toFixed(1)}%` : "—";
  bfWarningEl.textContent = result?.warning ?? "";
  bfWarningEl.hidden = !result?.warning;

  const category = result && bfCategory(result.bfComp, m.sex);
  bfCategoryEl.hidden = !category;
  bfCategoryEl.textContent = category?.label ?? "";
  bfCategoryEl.className = `bf-category ${category?.key ?? ""}`;

  // Change vs the latest entry before the date being edited.
  const prev = entries.filter((e) => e.date < m.date).at(-1);
  bfDeltaEl.hidden = !(result && prev);
  if (result && prev) {
    const diff = Math.round((result.bfComp - prev.bfComp) * 10) / 10;
    const since = `since ${formatDate(prev.date, { month: "short", day: "numeric" })}`;
    bfDeltaEl.textContent = diff === 0 ? `No change ${since}` : `${diff < 0 ? "▼" : "▲"} ${Math.abs(diff).toFixed(1)} ${since}`;
    bfDeltaEl.className = `bf-delta ${diff < 0 ? "down" : diff > 0 ? "up" : ""}`;
  }
}

// events
function onWeeklyInput() {
  update();
  scheduleSave();
}

function onDateChange() {
  const existing = entries.find((e) => e.date === dateInput.value);
  if (existing) writeWeeklyFields(existing.waistCm, existing.weightKg);
  update();
}

function onSettingsInput() {
  const m = readMeasurement();
  for (const key of ["neckCm", "hipCm", "heightCm", "age"]) {
    if (Number.isFinite(m[key]) && m[key] > 0) settings[key] = m[key];
  }
  saveSettings();
  update();
  scheduleSave();
}

function onSexChange() {
  settings.sex = sexInput.value === "female" ? "female" : "male";
  if (!entries.length) {
    // Still on first-run values: swap in the other sex's defaults.
    const d = DEFAULTS[settings.sex];
    Object.assign(settings, { neckCm: d.neckCm, heightCm: d.heightCm, age: d.age });
    if (d.hipCm) settings.hipCm = d.hipCm;
    writeWeeklyFields(d.waistCm, d.weightKg);
    writeSettingsFields(settings);
  } else if (settings.sex === "female" && !settings.hipCm) {
    settings.hipCm = DEFAULTS.female.hipCm;
    put(hipInput, lenOut(settings.hipCm), settings.hipCm);
  }
  saveSettings();
  applySexUI();
  update();
  scheduleSave();
}

function onUnitChange() {
  // Read with the old units before switching; hip is read even while hidden.
  const m = { ...readMeasurement(), hipCm: take(hipInput, lenIn) };
  settings.units = unitToggle.value === "metric" ? "metric" : "us";
  saveSettings();
  writeWeeklyFields(m.waistCm, m.weightKg);
  writeSettingsFields(m);
  applyUnitsUI();
  update();
  renderHistory();
}

// auto-save (§5): debounced, valid entries only
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrent, SAVE_DELAY_MS);
}

function flushSave() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveCurrent();
}

function saveCurrent() {
  saveTimer = null;
  const m = readMeasurement();
  const result = compute(m);
  if (!result || !m.date) return;

  const entry = { ...m, bmi: result.bmi, bfNavy: result.bfNavy, bfComp: result.bfComp };
  const i = entries.findIndex((e) => e.date === m.date);
  if (i >= 0) entries[i] = entry;
  else entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date));

  saveEntries();
  renderHistory();
  renderChart();
  update();
}

// history (newest first)
function renderHistory() {
  historyTableBody.replaceChildren();
  for (const e of [...entries].reverse()) {
    const tr = document.createElement("tr");
    const date = formatDate(e.date, { dateStyle: "medium" });
    for (const text of [date, e.bfComp.toFixed(1), lenOut(e.waistCm), massOut(e.weightKg)]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }

    const delTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Delete";
    btn.setAttribute("aria-label", `Delete ${date}`);
    btn.addEventListener("click", () => {
      if (!confirm(`Delete entry for ${date}?`)) return;
      entries = entries.filter((x) => x.date !== e.date);
      saveEntries();
      renderHistory();
      renderChart();
      update();
    });
    delTd.appendChild(btn);
    tr.appendChild(delTd);

    historyTableBody.appendChild(tr);
  }
}

// chart (inline SVG, §2.4)
function svg(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text != null) el.textContent = text;
  return el;
}

function renderChart() {
  const W = 320;
  const H = 200;
  chartSvg.replaceChildren();

  if (entries.length < 2) {
    chartSvg.appendChild(
      svg("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "chart-empty" }, "Add 2+ entries to see a trend.")
    );
    return;
  }

  const pad = { l: 34, r: 10, t: 18, b: 22 };
  const bf = entries.map((e) => e.bfComp);
  const ma = weightedMA(bf);
  const t = entries.map((e) => localTime(e.date));

  const all = [...bf, ...ma.filter((v) => v !== null)];
  let yMin = Math.floor(Math.min(...all) - 0.5);
  let yMax = Math.ceil(Math.max(...all) + 0.5);
  if (yMax - yMin < 2) yMax = yMin + 2;
  const t0 = t[0];
  const tSpan = t[t.length - 1] - t0 || 1;

  const x = (ti) => pad.l + ((ti - t0) / tSpan) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - ((v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  // y grid: ~4 steps
  const step = Math.max(1, Math.ceil((yMax - yMin) / 4));
  for (let v = yMin; v <= yMax; v += step) {
    chartSvg.appendChild(svg("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: "#e5e5ea", "stroke-dasharray": "2 3" }));
    chartSvg.appendChild(
      svg("text", { x: pad.l - 4, y: y(v) + 3, "text-anchor": "end", "font-size": 9, fill: "#6c6c70" }, `${v}%`)
    );
  }

  // x labels: first and last date
  const xLabel = (i, anchor) =>
    svg(
      "text",
      { x: x(t[i]), y: H - 6, "text-anchor": anchor, "font-size": 9, fill: "#6c6c70" },
      formatDate(entries[i].date, { month: "short", day: "numeric" })
    );
  chartSvg.appendChild(xLabel(0, "start"));
  chartSvg.appendChild(xLabel(entries.length - 1, "end"));

  const points = (vals) =>
    vals
      .map((v, i) => (v === null ? null : `${x(t[i]).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");

  // Soft area fill under the BF% line.
  const defs = svg("defs", {});
  const grad = svg("linearGradient", { id: "bfFill", x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svg("stop", { offset: "0%", "stop-color": "#007aff", "stop-opacity": 0.22 }));
  grad.appendChild(svg("stop", { offset: "100%", "stop-color": "#007aff", "stop-opacity": 0 }));
  defs.appendChild(grad);
  chartSvg.appendChild(defs);
  const base = H - pad.b;
  chartSvg.appendChild(
    svg("polygon", {
      points: `${x(t[0]).toFixed(1)},${base} ${points(bf)} ${x(t[t.length - 1]).toFixed(1)},${base}`,
      fill: "url(#bfFill)",
    })
  );

  const line = { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
  chartSvg.appendChild(svg("polyline", { ...line, points: points(bf), stroke: "#007aff", "stroke-width": 2 }));
  if (ma.some((v) => v !== null)) {
    chartSvg.appendChild(
      svg("polyline", { ...line, points: points(ma), stroke: "#ff9500", "stroke-width": 2, "stroke-dasharray": "4 4" })
    );
  }
  bf.forEach((v, i) => chartSvg.appendChild(svg("circle", { cx: x(t[i]), cy: y(v), r: 2.5, fill: "#007aff" })));

  // Latest point: larger dot + value label, on the side away from the average line.
  const li = bf.length - 1;
  const below = ma[li] !== null && ma[li] > bf[li];
  chartSvg.appendChild(svg("circle", { cx: x(t[li]), cy: y(bf[li]), r: 4.5, fill: "#fff", stroke: "#007aff", "stroke-width": 2.5 }));
  chartSvg.appendChild(
    svg(
      "text",
      {
        x: x(t[li]) - 7,
        y: y(bf[li]) + (below ? 16 : -8),
        "text-anchor": "end",
        "font-size": 10,
        "font-weight": 600,
        fill: "#007aff",
        stroke: "#fff",
        "stroke-width": 3,
        "paint-order": "stroke",
      },
      `${bf[li].toFixed(1)}%`
    )
  );

  // legend
  chartSvg.appendChild(svg("text", { x: W - pad.r - 52, y: 10, "font-size": 9, fill: "#007aff" }, "BF%"));
  chartSvg.appendChild(svg("text", { x: W - pad.r - 26, y: 10, "font-size": 9, fill: "#ff9500" }, "Avg"));
}

// export (§2.6)
function onExportCsv() {
  if (!entries.length) return;

  const header = [
    "date",
    "sex",
    "waist_cm",
    "neck_cm",
    "hip_cm",
    "height_cm",
    "weight_kg",
    "age",
    "bmi",
    "bf_navy",
    "bf_composite",
  ];
  const f = (v) => (v == null ? "" : v.toFixed(2));
  const rows = entries.map((e) =>
    [
      e.date,
      e.sex,
      f(e.waistCm),
      f(e.neckCm),
      f(e.hipCm),
      f(e.heightCm),
      f(e.weightKg),
      e.age,
      f(e.bmi),
      f(e.bfNavy),
      f(e.bfComp),
    ].join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `bf-tracker-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Dates are local calendar days ("YYYY-MM-DD"), never UTC.
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Local midnight; Date.parse("YYYY-MM-DD") would be UTC.
function localTime(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// Display a stored "YYYY-MM-DD" in the user's locale format.
function formatDate(date, options) {
  return new Date(localTime(date)).toLocaleDateString(undefined, options);
}

init();

// Cache-first SW would serve stale files while developing; add ?sw to test offline locally.
const isDev = ["localhost", "127.0.0.1"].includes(location.hostname) && !location.search.includes("sw");
if ("serviceWorker" in navigator) {
  if (isDev) navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  else {
    // When an update activates, reload once so the new files show immediately
    // (skipped on first install, when there was no previous controller).
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) location.reload();
    });
    navigator.serviceWorker.register("service-worker.js");
  }
}
