/**
 * @file Pure formulas and conversions (REQUIREMENTS §3–4). All inputs metric.
 */
"use strict";

export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;

export function navyBF({ sex, waistCm, neckCm, hipCm, heightCm }) {
  if (sex === "female") {
    return (
      495 /
        (1.29579 -
          0.35004 * Math.log10(waistCm + hipCm - neckCm) +
          0.221 * Math.log10(heightCm)) -
      450
    );
  }
  return (
    495 /
      (1.0324 -
        0.19077 * Math.log10(waistCm - neckCm) +
        0.15456 * Math.log10(heightCm)) -
    450
  );
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function compositeBF(bfNavy, bmiValue, age) {
  return bfNavy + 0.3 * (bmiValue - 25) + 0.05 * (age - 40);
}

const pos = (v) => Number.isFinite(v) && v > 0;

/**
 * Validate a measurement and derive body-fat figures.
 * @param {{sex: string, waistCm: number, neckCm: number, hipCm: ?number, heightCm: number, weightKg: number, age: number}} m
 *   hipCm is required only for female.
 * @returns {?{bfNavy: number, bmi: number, bfComp: number, warning: string}}
 *   null when any input is non-positive/non-finite or the Navy log argument would be <= 0 (§3.4);
 *   `warning` is non-empty for implausible but computable values.
 */
export function compute(m) {
  const female = m.sex === "female";
  const required = [m.waistCm, m.neckCm, m.heightCm, m.weightKg, m.age];
  if (female) required.push(m.hipCm);
  if (!required.every(pos)) return null;
  if (female ? m.waistCm + m.hipCm <= m.neckCm : m.waistCm <= m.neckCm) return null;

  const bfNavy = navyBF(m);
  const b = bmi(m.weightKg, m.heightCm);
  const bfComp = compositeBF(bfNavy, b, m.age);
  if (!Number.isFinite(bfComp)) return null;

  let warning = "";
  if (bfComp < 2 || bfComp > 60) warning = "BF% outside 2–60%";
  else if (m.heightCm < 120 || m.heightCm > 230) warning = "Height outside 120–230 cm";
  else if (m.weightKg < 30 || m.weightKg > 300) warning = "Weight outside 30–300 kg";

  return { bfNavy, bmi: b, bfComp, warning };
}

// 1:2:3 weighted moving average (oldest → newest); null for the first two points.
export function weightedMA(values) {
  return values.map((v, i) =>
    i < 2 ? null : (values[i - 2] + 2 * values[i - 1] + 3 * v) / 6
  );
}

// American Council on Exercise ranges; upper bounds exclusive.
const CATEGORIES = {
  male: [6, 14, 18, 25],
  female: [14, 21, 25, 32],
};
const LABELS = [
  ["essential", "Essential"],
  ["athletic", "Athletic"],
  ["fit", "Fit"],
  ["average", "Average"],
  ["high", "High"],
];

export function bfCategory(bf, sex) {
  const bounds = CATEGORIES[sex === "female" ? "female" : "male"];
  const i = bounds.findIndex((b) => bf < b);
  const [key, label] = LABELS[i === -1 ? LABELS.length - 1 : i];
  return { key, label };
}

// Fat mass = weight × BF%; lean (fat-free) mass = the rest. Same unit as weight.
export function massSplit(weight, bfPercent) {
  const fatKg = (weight * bfPercent) / 100;
  return { fatKg, leanKg: weight - fatKg };
}
