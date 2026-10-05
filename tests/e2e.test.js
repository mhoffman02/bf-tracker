/** @file End-to-end tests driving the real UI (app.js + index.html) in jsdom. */
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { loadApp } from "./helpers/app.js";

test("weekly workflow: enter waist + weight → auto-saved → prefilled after reload", async () => {
  const app = await loadApp();
  assert.equal(app.entries().length, 0, "opening the app must not save anything");

  app.type("waistInput", 38);
  app.type("weightInput", 190);
  assert.match(app.bf(), /^\d+\.\d%$/);

  await sleep(600); // debounce ~500 ms
  const [entry] = app.entries();
  assert.equal(entry.date, app.$("dateInput").value);
  assert.equal(entry.bfComp.toFixed(1) + "%", app.bf());
  assert.equal(app.historyRows(), 1);
  app.close();

  const again = await loadApp(app.dump());
  assert.equal(again.$("waistInput").value, "38");
  assert.equal(again.$("weightInput").value, "190");
  assert.equal(again.bf(), app.bf());
  again.close();
});

test("units: switching to metric converts values, keeps BF%, and persists", async () => {
  const app = await loadApp();
  // Values whose metric display rounds enough to shift BF% if re-read.
  app.type("waistInput", 34);
  app.type("weightInput", 190);
  app.type("neckInput", 14.5);
  app.type("heightFtInput", 5);
  app.type("heightInInput", 6);
  app.type("ageInput", 60);
  const before = app.bf();

  app.select("unitToggle", "metric");
  assert.equal(app.$("waistInput").value, "86.4"); // 34 in
  assert.equal(app.$("weightInput").value, "86.2"); // 190 lb
  assert.equal(app.$("heightCmInput").value, "167.6"); // 5′6″
  assert.equal(app.$("heightCmField").hidden, false);
  assert.equal(app.$("heightUsRow").hidden, true);
  assert.equal(app.bf(), before);
  app.leave();
  app.close();

  const again = await loadApp(app.dump());
  assert.equal(again.$("unitToggle").value, "metric");
  assert.equal(again.$("waistInput").value, "86.4");
  assert.equal(again.bf(), before);
  again.close();
});

test("female: hip required; incomplete input shows — and saves nothing", async () => {
  const app = await loadApp();
  assert.equal(app.$("hipField").hidden, true);

  app.select("sexInput", "female");
  assert.equal(app.$("hipField").hidden, false);
  assert.match(app.bf(), /%$/);

  app.type("hipInput", "");
  assert.equal(app.bf(), "—");
  app.leave();
  assert.equal(app.entries().length, 0);

  app.type("hipInput", 42);
  app.leave();
  assert.equal(app.entries()[0].sex, "female");
  app.close();
});

test("measuring hints: waist site follows Sex", async () => {
  const app = await loadApp();
  const site = () =>
    [...app.window.document.querySelectorAll("#waistHint [data-sex]")]
      .filter((el) => !el.hidden)
      .map((el) => el.textContent)
      .join("|");

  assert.match(site(), /navel/);
  app.select("sexInput", "female");
  assert.match(site(), /narrowest/i);
  assert.ok(app.$("neckHint").textContent.includes("Adam"));
  app.close();
});

test("date defaults to the local calendar day", async () => {
  const app = await loadApp();
  const d = new Date();
  const local = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  assert.equal(app.$("dateInput").value, local);
  app.close();
});

const prior = (date, bfComp) => ({
  date, sex: "male", waistCm: 101.6, neckCm: 39.37, hipCm: null, heightCm: 175.26,
  weightKg: 90.72, age: 40, bmi: 29.5, bfNavy: 25, bfComp,
});
const localFmt = (iso, opts) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
};

test("header shows change since previous entry, range pill, local-format dates", async () => {
  const app = await loadApp({ "bf.entries": JSON.stringify([prior("2026-09-27", 40)]) });
  const delta = app.$("bfDelta");
  assert.equal(delta.hidden, false);
  assert.match(delta.textContent, /^▼ \d+\.\d since /);
  assert.ok(delta.textContent.endsWith(localFmt("2026-09-27", { month: "short", day: "numeric" })));
  assert.ok(delta.classList.contains("down"));
  assert.ok(app.$("bfCategory").textContent.length > 0);

  const firstCell = app.window.document.querySelector("#historyTable tbody td").textContent;
  assert.equal(firstCell, localFmt("2026-09-27", { dateStyle: "medium" }));
  app.close();
});

test("privacy: notice shown; using the app makes no network requests", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(String(args[0]));
    throw new Error("network");
  };
  try {
    const app = await loadApp();
    const w = app.window;
    w.fetch = globalThis.fetch;
    w.XMLHttpRequest.prototype.open = function (_m, url) {
      calls.push(String(url));
    };
    w.navigator.sendBeacon = (url) => (calls.push(String(url)), true);

    assert.match(app.$("privacyNote").textContent, /Data Not Collected/);
    app.type("waistInput", 37);
    app.select("unitToggle", "metric");
    app.select("sexInput", "female");
    app.leave();
    app.$("exportCsvBtn").dispatchEvent(new w.Event("click"));
    assert.deepEqual(calls, []);
    app.close();
  } finally {
    globalThis.fetch = realFetch;
  }
});

const pickFile = async (app, text) => {
  const w = app.window;
  const input = app.$("importInput");
  const file = new w.File([text], "backup.csv", { type: "text/csv" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  app.$("backupStatus").textContent = "";
  input.dispatchEvent(new w.Event("change"));
  // The file is read asynchronously; wait for the result message.
  for (let i = 0; i < 100 && !app.$("backupStatus").textContent; i++) await sleep(10);
};

test("restore from CSV: merges by date, replaces same date, reports result", async () => {
  const app = await loadApp({ "bf.entries": JSON.stringify([prior("2026-09-27", 40)]) });
  const csv =
    "date,sex,waist_cm,neck_cm,hip_cm,height_cm,weight_kg,age\n" +
    "2026-09-20,male,100,39.37,,175.26,90,40\n" +
    "2026-09-27,male,99,39.37,,175.26,89,40\n" +
    "not-a-date,male,99,39.37,,175.26,89,40\n";
  await pickFile(app, csv);

  const dates = app.entries().map((e) => e.date);
  assert.deepEqual(dates, ["2026-09-20", "2026-09-27"]);
  assert.notEqual(app.entries()[1].bfComp, 40, "same date replaced by imported row");
  assert.match(app.$("backupStatus").textContent, /Imported 2 .*1 skipped/);
  assert.equal(app.historyRows(), 2);
  app.close();
});

test("restore on a fresh install also restores the profile", async () => {
  const app = await loadApp();
  const csv =
    "date,sex,waist_cm,neck_cm,hip_cm,height_cm,weight_kg,age\n" +
    "2026-09-27,female,80,33,100,165,70,35\n";
  await pickFile(app, csv);

  assert.equal(app.$("sexInput").value, "female");
  assert.equal(app.$("hipField").hidden, false);
  assert.equal(app.$("ageInput").value, "35");
  assert.equal(JSON.parse(app.window.localStorage.getItem("bf.settings")).sex, "female");
  app.close();
});

test("chart: switch metric to waist / weight; choice persists", async () => {
  const seed = [prior("2026-09-13", 27), prior("2026-09-20", 26.5), prior("2026-09-27", 26)];
  const app = await loadApp({ "bf.entries": JSON.stringify(seed) });
  const chart = app.$("trendChart");
  const tab = (m) => app.window.document.querySelector(`[data-metric="${m}"]`);

  assert.equal(tab("bf").getAttribute("aria-pressed"), "true");
  tab("waist").dispatchEvent(new app.window.Event("click"));
  assert.equal(tab("waist").getAttribute("aria-pressed"), "true");
  assert.match(chart.getAttribute("aria-label"), /Waist/);
  assert.ok(chart.textContent.includes("40.0 in"), "latest waist labelled in display units");

  tab("weight").dispatchEvent(new app.window.Event("click"));
  assert.ok(chart.textContent.includes("200.0 lb"));
  app.close();

  const again = await loadApp(app.dump());
  assert.equal(again.window.document.querySelector('[data-metric="weight"]').getAttribute("aria-pressed"), "true");
  again.close();
});

test("rebrand: Body Comp name; header shows fat and lean mass in display units", async () => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Body Comp");
  assert.equal(manifest.short_name, "Body Comp");

  const app = await loadApp();
  assert.equal(app.window.document.title, "Body Comp");
  const split = () => app.$("massSplit").textContent;
  const m = split().match(/^Fat ([\d.]+) lb · Lean ([\d.]+) lb$/);
  assert.ok(m, split());
  assert.ok(Math.abs(Number(m[1]) + Number(m[2]) - 200) < 0.15, "fat + lean = weight");

  app.select("unitToggle", "metric");
  assert.match(split(), /^Fat [\d.]+ kg · Lean [\d.]+ kg$/);

  app.type("weightInput", "");
  assert.equal(app.$("massSplit").hidden, true);
  app.close();
});

test("restore onto an app with older entries adopts the newer imported profile", async () => {
  const app = await loadApp({ "bf.entries": JSON.stringify([prior("2026-09-01", 26)]) });
  const csv =
    "date,sex,waist_cm,neck_cm,hip_cm,height_cm,weight_kg,age\n" +
    "2026-09-27,male,93.98,41.91,,185.42,83.91,61\n";
  await pickFile(app, csv);

  assert.equal(app.$("neckInput").value, "16.5");
  assert.equal(app.$("heightFtInput").value, "6");
  assert.equal(app.$("heightInInput").value, "1");
  assert.equal(app.$("ageInput").value, "61");
  assert.equal(JSON.parse(app.window.localStorage.getItem("bf.settings")).age, 61);
  app.close();
});

test("restoring only older entries keeps the current profile", async () => {
  const app = await loadApp({ "bf.entries": JSON.stringify([prior("2026-10-01", 26)]) });
  const csv =
    "date,sex,waist_cm,neck_cm,hip_cm,height_cm,weight_kg,age\n" +
    "2026-09-01,male,93.98,41.91,,185.42,83.91,61\n";
  await pickFile(app, csv);

  assert.equal(app.$("ageInput").value, "40");
  assert.equal(app.entries().length, 2);
  app.close();
});

test("date is never left empty (iOS picker Reset, page restore, after import)", async () => {
  const app = await loadApp();
  const date = app.$("dateInput");
  const today = date.value;

  date.value = "";
  date.dispatchEvent(new app.window.Event("change"));
  assert.equal(date.value, today, "cleared via picker → back to today");

  date.value = "";
  app.window.dispatchEvent(new app.window.Event("pageshow"));
  assert.equal(date.value, today, "page restored with empty date → today");

  date.value = "";
  await pickFile(app, "date,sex,waist_cm,neck_cm,hip_cm,height_cm,weight_kg,age\n2026-09-27,male,96,40,,175,88,40\n");
  assert.equal(date.value, today, "after restore → today");
  app.close();
});

test("restoring yesterday's backup today: keeps today's date, saves nothing new", async () => {
  const app = await loadApp();
  const today = app.$("dateInput").value;
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  const yesterday = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()].map((n) => String(n).padStart(2, "0")).join("-");

  await pickFile(app, `date,sex,waist_cm,neck_cm,hip_cm,height_cm,weight_kg,age\n${yesterday},male,96,40,,175,88,40\n`);
  app.leave(); // flush anything pending

  assert.equal(app.$("dateInput").value, today, "date stays today");
  assert.deepEqual(app.entries().map((e) => e.date), [yesterday], "only yesterday's entry; nothing written for today");
  assert.equal(app.$("waistInput").value, String(Math.round((96 / 2.54) * 10) / 10), "fields prefilled from the latest entry");
  assert.match(app.$("bfDelta").textContent, /^No change since /);
  app.close();
});

const stubDownload = (app) => {
  const orig = URL.createObjectURL;
  let blob = null;
  URL.createObjectURL = (b) => ((blob = b), "blob:test");
  app.window.HTMLAnchorElement.prototype.click = () => {};
  return { blob: () => blob, restore: () => (URL.createObjectURL = orig) };
};

test("export saves pending typing first (nothing lost if iOS reloads the app)", async () => {
  const app = await loadApp();
  const dl = stubDownload(app);
  app.type("waistInput", 37); // debounce still pending
  app.$("exportCsvBtn").dispatchEvent(new app.window.Event("click"));
  dl.restore();

  assert.equal(app.entries().length, 1, "entry saved before export");
  assert.match(await dl.blob().text(), /\n\d{4}-\d{2}-\d{2},male,93\.98,/);
  app.close();
});

test("export uses the Share sheet when available (stays in the app on iOS)", async () => {
  const app = await loadApp({ "bf.entries": JSON.stringify([prior("2026-09-27", 26)]) });
  const dl = stubDownload(app);
  const shared = [];
  Object.assign(app.window.navigator, {
    canShare: (data) => Array.isArray(data?.files),
    share: async (data) => void shared.push(data),
  });
  Object.defineProperty(app.window.navigator, "maxTouchPoints", { value: 5 }); // phone
  app.$("exportCsvBtn").dispatchEvent(new app.window.Event("click"));
  dl.restore();

  assert.equal(shared.length, 1);
  assert.match(shared[0].files[0].name, /^body-comp-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(dl.blob(), null, "no download link used");
  app.close();
});

test("returning to the app refills any emptied fields from saved data", async () => {
  const app = await loadApp({ "bf.entries": JSON.stringify([prior("2026-09-27", 26)]) });
  for (const id of ["dateInput", "waistInput", "weightInput", "neckInput", "heightFtInput", "heightInInput", "ageInput"]) {
    app.$(id).value = "";
  }
  app.window.dispatchEvent(new app.window.Event("pageshow"));

  assert.ok(app.$("dateInput").value);
  assert.equal(app.$("waistInput").value, "40");
  assert.equal(app.$("weightInput").value, "200");
  assert.equal(app.$("neckInput").value, "15.5");
  assert.equal(app.$("heightFtInput").value, "5");
  assert.equal(app.$("ageInput").value, "40");
  assert.match(app.bf(), /%$/);
  app.close();
});
