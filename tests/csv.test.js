/** @file Unit tests for csv.js. */
"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import { CM_PER_IN, KG_PER_LB, compute } from "../calc.js";
import { toCSV, parseCSV } from "../csv.js";

const entry = (date, over = {}) => {
  const m = {
    date,
    sex: "male",
    waistCm: 38 * CM_PER_IN,
    neckCm: 15.5 * CM_PER_IN,
    hipCm: null,
    heightCm: 69 * CM_PER_IN,
    weightKg: 195 * KG_PER_LB,
    age: 40,
    ...over,
  };
  const r = compute(m);
  return { ...m, bmi: r.bmi, bfNavy: r.bfNavy, bfComp: r.bfComp };
};

test("export → import round-trips entries", () => {
  const entries = [entry("2026-09-27"), entry("2026-10-04", { sex: "female", hipCm: 106, neckCm: 33 })];
  const { entries: back, skipped } = parseCSV(toCSV(entries));
  assert.equal(skipped, 0);
  assert.equal(back.length, 2);
  for (const [i, e] of back.entries()) {
    assert.equal(e.date, entries[i].date);
    assert.equal(e.sex, entries[i].sex);
    assert.ok(Math.abs(e.bfComp - entries[i].bfComp) < 0.01);
  }
  assert.equal(back[0].hipCm, null);
});

test("import tolerates BOM, CRLF, quotes, column order", () => {
  const csv =
    '﻿"weight_kg","date","waist_cm","neck_cm","height_cm","age","sex"\r\n' +
    '"88.45","2026-10-04","96.52","39.37","175.26","40","male"\r\n';
  const { entries, skipped } = parseCSV(csv);
  assert.equal(skipped, 0);
  assert.equal(entries[0].date, "2026-10-04");
  assert.equal(entries[0].weightKg, 88.45);
});

test("import accepts US M/D/YYYY dates (e.g. re-saved from Numbers)", () => {
  const csv = "date,sex,waist_cm,neck_cm,height_cm,weight_kg,age\n10/4/2026,male,96.52,39.37,175.26,88.45,40\n";
  assert.equal(parseCSV(csv).entries[0].date, "2026-10-04");
});

test("import skips invalid rows; recomputes BF% instead of trusting the file", () => {
  const csv =
    "date,sex,waist_cm,neck_cm,height_cm,weight_kg,age,bf_composite\n" +
    "2026-02-30,male,96.52,39.37,175.26,88.45,40,1\n" + // impossible date
    "2026-10-04,male,abc,39.37,175.26,88.45,40,1\n" + // bad number
    "2026-10-05,female,80,33,165,70,40,1\n" + // female without hip
    "2026-10-06,male,96.52,39.37,175.26,88.45,40,99\n";
  const { entries, skipped } = parseCSV(csv);
  assert.equal(skipped, 3);
  assert.equal(entries.length, 1);
  assert.notEqual(entries[0].bfComp, 99);
});

test("import of an empty or header-only file finds nothing", () => {
  assert.deepEqual(parseCSV(""), { entries: [], skipped: 0 });
  assert.deepEqual(parseCSV("date,sex\n"), { entries: [], skipped: 0 });
});
