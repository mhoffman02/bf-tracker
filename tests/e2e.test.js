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
