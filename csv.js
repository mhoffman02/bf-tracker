/**
 * @file CSV backup format (REQUIREMENTS §2.6). Pure functions; no DOM.
 */
"use strict";

import { compute } from "./calc.js";

export const CSV_COLUMNS = [
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

export function toCSV(entries) {
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
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

/**
 * Parse a backup CSV into entries.
 * Columns are matched by header name, so order doesn't matter. Derived values
 * (bmi, bf_*) are recomputed from the measurements; invalid rows are skipped.
 * @param {string} text
 * @returns {{entries: object[], skipped: number}}
 */
export function parseCSV(text) {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (!lines.length) return { entries: [], skipped: 0 };

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const entries = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const row = splitRow(line);
    const get = (name) => {
      const i = header.indexOf(name);
      return i < 0 ? "" : (row[i] ?? "").trim();
    };
    const num = (name) => (get(name) === "" ? NaN : Number(get(name)));
    const sex = get("sex").toLowerCase() === "female" ? "female" : "male";
    const m = {
      date: parseDate(get("date")),
      sex,
      waistCm: num("waist_cm"),
      neckCm: num("neck_cm"),
      hipCm: sex === "female" ? num("hip_cm") : null,
      heightCm: num("height_cm"),
      weightKg: num("weight_kg"),
      age: num("age"),
    };
    const result = m.date ? compute(m) : null;
    if (!result) {
      skipped++;
      continue;
    }
    entries.push({ ...m, bmi: result.bmi, bfNavy: result.bfNavy, bfComp: result.bfComp });
  }
  return { entries, skipped };
}

// Minimal CSV field splitter: commas, double-quoted fields, "" escapes.
function splitRow(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// "YYYY-MM-DD", or US "M/D/YYYY" (spreadsheets may rewrite dates on save).
// Returns a local calendar date "YYYY-MM-DD", or "" if invalid.
function parseDate(s) {
  let k = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, m, d;
  if (k) [y, m, d] = [k[1], k[2], k[3]].map(Number);
  else if ((k = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [m, d, y] = [k[1], k[2], k[3]].map(Number);
  else return "";

  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}
