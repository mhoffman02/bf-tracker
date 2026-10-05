# BF Tracker — Requirements

Single‑page PWA for tracking weekly body‑fat percentage.

## 1. Purpose

A minimal, installable single‑page web app (iPhone, iPad, desktop) that tracks weekly body‑fat percentage with a composite formula. Priorities: simplicity, low cognitive load, fast entry, clear trend.

**Weekly workflow:** Waist → Weight → Done.

## 2. Features

### 2.1 Primary output

- Composite BF% displayed prominently at the top; always visible.
- Recalculates live as the user types.
- Shown to 1 decimal place (e.g. `22.4%`).
- Shows `—` when inputs are incomplete or invalid.
- Range pill under the number (American Council on Exercise ranges, by sex):

  | Label     | Male    | Female  |
  | --------- | ------- | ------- |
  | Essential | < 6     | < 14    |
  | Athletic  | 6–13.9  | 14–20.9 |
  | Fit       | 14–17.9 | 21–24.9 |
  | Average   | 18–24.9 | 25–31.9 |
  | High      | ≥ 25    | ≥ 32    |

- Change line vs the previous entry: `▼ 0.4 since Sep 27` (green down, red up).

### 2.2 Weekly inputs (always visible)

| Field  | Control               | US unit | Metric unit |
| ------ | --------------------- | ------- | ----------- |
| Date   | `<input type="date">` | —       | —           |
| Waist  | numeric input         | in      | cm          |
| Weight | numeric input         | lb      | kg          |

- Date defaults to today.
- Waist and weight are prefilled from the most recent entry.

### 2.3 Profile & settings (collapsed: “More / Settings”)

| Field  | US unit | Metric unit | Notes                  |
| ------ | ------- | ----------- | ---------------------- |
| Sex    | —       | —           | Male / Female          |
| Units  | —       | —           | US ↔ Metric toggle     |
| Neck   | in      | cm          |                        |
| Hip    | in      | cm          | Shown only when Female |
| Height | ft + in | cm          |                        |
| Age    | years   | years       |                        |

Values persist and are reused for every entry. Each saved entry stores a snapshot of the profile values used.

### 2.4 Trend chart (always visible)

- Line chart of composite BF% over time (x = date, y = BF%).
- Overlay: 3‑point weighted moving average, weights **1 : 2 : 3** (oldest → newest):
  `MA_i = (BF_{i-2} + 2·BF_{i-1} + 3·BF_i) / 6`, starting from the 3rd entry.
- Rendered as hand‑written inline SVG; no chart library or CDN.
- Empty state: “Add 2+ entries to see a trend.”

### 2.5 History (collapsed)

- Table: date, BF%, waist, weight — newest first, in current display units.
- Per‑row delete (with confirm).
- No inline editing; re‑entering a date overwrites that entry (see §5).

### 2.6 Export (collapsed)

- CSV download of all entries, generated client‑side.
- Columns: `date, sex, waist_cm, neck_cm, hip_cm, height_cm, weight_kg, age, bmi, bf_navy, bf_composite`.

## 3. Formulas

All calculations use metric internally.

| Symbol | Meaning | Unit |
| ------ | ------- | ---- |
| `W`    | Waist   | cm   |
| `N`    | Neck    | cm   |
| `P`    | Hip     | cm   |
| `H`    | Height  | m    |
| `Wt`   | Weight  | kg   |
| `Age`  | Age     | yr   |

### 3.1 U.S. Navy BF%

Male:

```
BF_navy = 495 / (1.0324 − 0.19077·log10(W − N) + 0.15456·log10(100·H)) − 450
```

Female:

```
BF_navy = 495 / (1.29579 − 0.35004·log10(W + P − N) + 0.22100·log10(100·H)) − 450
```

### 3.2 BMI

```
BMI = Wt / H²
```

### 3.3 Composite BF%

```
BF_comp = BF_navy + 0.3·(BMI − 25) + 0.05·(Age − 40)
```

Applied identically for both sexes (assumption — see §11).

### 3.4 Validation

- All inputs required and > 0.
- Male: `W > N`. Female: `W + P > N`. (Keeps the log argument positive.)
- Plausible ranges (soft warning, still saved): BF_comp 2–60%, height 120–230 cm, weight 30–300 kg.
- Invalid input → output shows `—`; nothing is saved.

## 4. Units

- Default: US (lb, in, ft + in).
- Toggle lives in More / Settings; switching converts displayed values only.
- Storage is always metric.
- Conversions: 1 in = 2.54 cm; 1 lb = 0.45359237 kg.

## 5. Storage

- `localStorage`, two keys:
  - `bf.entries` — JSON array of entries, sorted by date.
  - `bf.settings` — JSON object: units, sex, neck, hip, height, age.
- **Entries are keyed by date.** Saving a date that already exists replaces it (upsert).
- **Auto‑save:** on each input change, debounced (~500 ms), only when the entry is valid (§3.4). Settings save immediately.
- **First run** (no stored data) prefills approximate U.S. adult averages:

  | Field  | Male          | Female        |
  | ------ | ------------- | ------------- |
  | Height | 5′9″ (175 cm) | 5′3″ (160 cm) |
  | Weight | 200 lb        | 170 lb        |
  | Waist  | 40 in         | 38 in         |
  | Neck   | 15.5 in       | 13.5 in       |
  | Hip    | —             | 42 in         |
  | Age    | 40            | 40            |

  Sex defaults to Male.

## 6. PWA

- Installable on iOS/iPadOS (Add to Home Screen) and desktop Chrome/Edge.
- `manifest.json`: name, `display: standalone`, theme/background colors, icons (§7) including a `maskable` 512 icon.
- Apple meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` (180×180).
- **Offline required:** service worker precaches all app files (cache‑first, versioned cache name, old caches removed on activate).
- Fast startup; no runtime network requests; no external fonts, scripts, or CDNs.
- **Privacy:** no data collected or shared (App Store label “Data Not Collected”). Footer notice in the app; Privacy section in README. A test fails if the app makes any network request while in use.

## 7. App icon

### 7.1 Design

| Attribute | Spec                                                       |
| --------- | ---------------------------------------------------------- |
| Style     | Apple‑minimal                                              |
| Color     | White glyph on Apple Blue (`#007AFF`) tile                 |
| Content   | “BF” + subtle ECG heartline beneath; no outer ring         |
| Theme     | Health metric / body‑composition tracker                   |
| Shape     | Rounded rectangle, 24% corner radius — favicon/in‑app only |

### 7.2 Master assets

| File                    | Use                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `icons/icon-master.svg` | Full‑bleed square (no rounding; iOS/Android apply their own mask). All content inside the central 80% safe zone. Glyphs as paths, not `<text>`. |
| `icons/favicon.svg`     | Rounded (24%) tile, “BF” only — no ECG (illegible below 64 px).                                                                                 |

### 7.3 Exports

| File                         | Size    | Source  | Used by                              |
| ---------------------------- | ------- | ------- | ------------------------------------ |
| `icons/icon-512.png`         | 512×512 | master  | manifest (`purpose: "any maskable"`) |
| `icons/icon-192.png`         | 192×192 | master  | manifest                             |
| `icons/apple-touch-icon.png` | 180×180 | master  | `<link rel="apple-touch-icon">`      |
| `icons/favicon-32.png`       | 32×32   | favicon | `<link rel="icon">`                  |
| `icons/favicon-64.png`       | 64×64   | favicon | optional, hi‑DPI tabs                |

## 8. UI / UX

- Apple Health–like light theme: grouped grey background (`#F2F2F7`), white 16 px cards, small uppercase grey section headers; blue `#007AFF` primary, green `#34C759` progress, orange `#FF9500` moving average, red `#FF3B30` warnings/delete only.
- Hero BF% in SF Rounded (`ui-rounded`); tabular numerals for all numbers.
- Inputs ≥ 16 px text (prevents iOS focus zoom), 44 px tall.
- Chart: soft blue area fill, labelled latest point, light dashed grid.
- Safe‑area insets (`viewport-fit=cover`) for home‑screen launch.
- Dates: stored `YYYY-MM-DD` as the **local** calendar day (never UTC); displayed in the user's locale format.
- Separate `index.html`, `styles.css`, `app.js`; no inline styles or scripts.
- Native controls: `<input type="date">`, `<details>`, `<select>`.
- Numeric inputs use `inputmode="decimal"` for the iOS keypad.
- Minimal keystrokes and clicks; no clutter.
- Collapsible sections for anything not done weekly.
- Tap targets ≥ 44 px; labels on every input.
- Measuring guidance without clutter: a one‑line grey hint under each tape/weight input (waist site follows Sex: navel for men, narrowest point for women), plus one collapsed “How to measure” section (tape tension, level, repeat readings, same conditions weekly). Sites follow the Navy/DoD tape method (DoDI 1308.3).

## 9. Non‑goals

- Backend, accounts, or login.
- Multi‑page navigation.
- Caliper (skinfold) inputs.
- DEXA calibration.
- Dark theme.

## 10. Nice‑to‑have

- CSV import (restores an export; enables manual cross‑device transfer).
- Chart overlays for waist and weight.

## 11. Open questions

- Should the composite adjustments (§3.3) differ for females?
- First‑run defaults (§5): male confirmed (2026‑10‑04); female values still approximations.
