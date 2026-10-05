import { test } from "node:test";
import assert from "node:assert/strict";
import { CM_PER_IN, KG_PER_LB, navyBF, bmi, compositeBF, compute, weightedMA, bfCategory, massSplit } from "../calc.js";

const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const male = {
  sex: "male",
  waistCm: 36 * CM_PER_IN,
  neckCm: 16 * CM_PER_IN,
  hipCm: null,
  heightCm: 71 * CM_PER_IN,
  weightKg: 180 * KG_PER_LB,
  age: 60,
};

// Oracle: the inch-based DoD forms of the same equations.
const lg = Math.log10;
const inch = (cm) => cm / CM_PER_IN;

test("navy male matches inch-based form", () => {
  const expected = 86.01 * lg(36 - 16) - 70.041 * lg(71) + 36.76;
  near(navyBF(male), expected, 0.5);
});

test("navy female matches inch-based form", () => {
  const f = { sex: "female", waistCm: 76, neckCm: 33, hipCm: 100, heightCm: 165 };
  const expected =
    163.205 * lg(inch(f.waistCm + f.hipCm - f.neckCm)) - 97.684 * lg(inch(f.heightCm)) - 78.387;
  near(navyBF(f), expected, 0.5);
});

test("bmi", () => {
  near(bmi(70, 175), 22.86, 0.01);
});

test("composite is identity at BMI 25, age 40", () => {
  assert.equal(compositeBF(20, 25, 40), 20);
  near(compositeBF(20, 30, 60), 22.5, 1e-9);
});

test("compute rejects invalid input", () => {
  assert.equal(compute({ ...male, waistCm: 0 }), null);
  assert.equal(compute({ ...male, waistCm: male.neckCm }), null);
  assert.equal(compute({ ...male, sex: "female", hipCm: NaN }), null);
});

test("compute flags implausible values", () => {
  assert.equal(compute(male).warning, "");
  assert.match(compute({ ...male, weightKg: 400 }).warning, /Weight/);
});

test("weighted MA 1:2:3", () => {
  assert.deepEqual(weightedMA([6, 12, 18, 24]), [null, null, 14, 20]);
});

test("BF% category uses sex-specific ACE ranges", () => {
  assert.equal(bfCategory(5, "male").key, "essential");
  assert.equal(bfCategory(13.9, "male").key, "athletic");
  assert.equal(bfCategory(17, "male").key, "fit");
  assert.equal(bfCategory(24, "male").key, "average");
  assert.equal(bfCategory(25, "male").key, "high");
  assert.equal(bfCategory(20, "female").key, "athletic");
  assert.equal(bfCategory(24, "female").key, "fit");
  assert.equal(bfCategory(31, "female").key, "average");
  assert.equal(bfCategory(32, "female").key, "high");
});

test("fat / lean mass split from weight and BF%", () => {
  const { fatKg, leanKg } = massSplit(90, 25);
  assert.equal(fatKg, 22.5);
  assert.equal(leanKg, 67.5);
});
