/**
 * @file Loads index.html + app.js into jsdom so tests can drive the real UI.
 */
"use strict";

import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8").replace(/<script[^>]*><\/script>/, "");
let loads = 0;

// `storage` seeds localStorage, e.g. a previous page's dump() to simulate a reload.
export async function loadApp(storage = {}) {
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
  const w = dom.window;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.confirm = () => true;

  for (const k of ["window", "document", "localStorage", "navigator", "confirm", "location"]) {
    Object.defineProperty(globalThis, k, { value: k === "window" ? w : w[k], configurable: true });
  }
  // Query string forces a fresh module instance per load.
  await import(new URL(`app.js?load=${++loads}`, root).href);

  const $ = (id) => w.document.getElementById(id);
  return {
    $,
    window: w,
    bf: () => $("bfCompValue").textContent,
    entries: () => JSON.parse(w.localStorage.getItem("bf.entries") ?? "[]"),
    historyRows: () => w.document.querySelectorAll("#historyTable tbody tr").length,
    type(id, value) {
      $(id).value = String(value);
      $(id).dispatchEvent(new w.Event("input"));
    },
    select(id, value) {
      $(id).value = value;
      $(id).dispatchEvent(new w.Event("change"));
    },
    // Flushes the debounced auto-save, as closing the app would.
    leave: () => w.dispatchEvent(new w.Event("pagehide")),
    dump: () => ({ ...w.localStorage }),
    // Flush any pending debounced save first: app timers are Node timers and
    // storage is reached via shared globals, so a late save could otherwise
    // write into the next test's app.
    close() {
      w.dispatchEvent(new w.Event("pagehide"));
      w.close();
    },
  };
}
