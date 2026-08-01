/** Colour bands for the weather page.
 *
 *  Everything here answers one question: "is this number fine or not?".
 *  Every scale shares the same six-step palette (--aqi-1 … --aqi-6), so a red
 *  bar means the same thing on the UV chart as on the ozone chart, and the
 *  headline AQI badge reads as the same language as the bars beneath it.
 *
 *  Thresholds are the US EPA AQI breakpoints (the scale Open-Meteo's `us_aqi`
 *  reports) and the WHO/WMO UV index bands — not invented cut-offs. Where the
 *  EPA publishes ppb, the value is converted at 25 °C / 1 atm, since Open-Meteo
 *  serves µg/m³. */

export type BandKey = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6';

export const BAND_COLOR: Record<BandKey, string> = {
  b1: 'var(--aqi-1)',
  b2: 'var(--aqi-2)',
  b3: 'var(--aqi-3)',
  b4: 'var(--aqi-4)',
  b5: 'var(--aqi-5)',
  b6: 'var(--aqi-6)',
};

/** upper bound of each band, ascending; the last band is open-ended */
function bander(edges: number[]): (v: number) => BandKey {
  return (v) => {
    for (let i = 0; i < edges.length; i++) if (v <= edges[i]!) return (`b${i + 1}`) as BandKey;
    return `b${edges.length + 1}` as BandKey;
  };
}

/* ---- air --------------------------------------------------------------- */

/** US AQI index value → band (0-50 good … 300+ hazardous) */
export const aqiBand = bander([50, 100, 150, 200, 300]);

export type Pollutant = 'pm25' | 'pm10' | 'o3' | 'no2';

/** EPA breakpoints in µg/m³. PM2.5 uses the 2024 revision (9 µg/m³ "good"
 *  ceiling); O3 and NO2 are converted from ppb (×1.96 and ×1.88). Applying a
 *  24-hour breakpoint to an hourly value overstates short spikes slightly —
 *  it is the same simplification every hourly AQI display makes. */
const POLLUTANT_EDGES: Record<Pollutant, number[]> = {
  pm25: [9, 35.4, 55.4, 125.4, 225.4],
  pm10: [54, 154, 254, 354, 424],
  o3: [106, 137, 167, 206, 392],
  no2: [100, 188, 677, 1221, 2349],
};

export function pollutantBand(p: Pollutant, v: number): BandKey {
  return bander(POLLUTANT_EDGES[p])(v);
}

/* ---- UV ----------------------------------------------------------------- */

/** WHO bands: <3 low, 3–5 moderate, 6–7 high, 8–10 very high, 11+ extreme.
 *  Five bands on a six-colour ramp — extreme reuses the purple, so the maroon
 *  stays exclusive to "hazardous" air. */
export const uvBand = bander([2.9, 5.9, 7.9, 10.9]);

export type UvLevel = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

export function uvLevelOf(v: number): UvLevel {
  const order: UvLevel[] = ['low', 'moderate', 'high', 'veryHigh', 'extreme'];
  return order[Number(uvBand(v).slice(1)) - 1]!;
}

/* ---- heat index (WBGT) --------------------------------------------------- */

/** 環境省 日常生活に関する指針: <21 ほぼ安全, 21–25 注意, 25–28 警戒,
 *  28–31 厳重警戒, 31+ 危険. Five bands, but the top one maps to the maroon
 *  rather than the purple: at WBGT 31 the ministry's own advice is to stop
 *  exercising and stay in air conditioning, which is the same register as
 *  "hazardous" air, not one step below it. */
export type HeatLevel = 'safe' | 'caution' | 'warning' | 'severe' | 'danger';

const HEAT_EDGES = [20.9, 24.9, 27.9, 30.9];

export function heatLevel(v: number): HeatLevel {
  const order: HeatLevel[] = ['safe', 'caution', 'warning', 'severe', 'danger'];
  for (let i = 0; i < HEAT_EDGES.length; i++) if (v <= HEAT_EDGES[i]!) return order[i]!;
  return 'danger';
}

export const HEAT_BAND: Record<HeatLevel, BandKey> = {
  safe: 'b1',
  caution: 'b2',
  warning: 'b3',
  severe: 'b4',
  danger: 'b6',
};

export const heatBand = (v: number): BandKey => HEAT_BAND[heatLevel(v)];

/* ---- rain --------------------------------------------------------------- */

/** Rain is not a hazard scale, so it gets the sequential blue ramp instead:
 *  darker = wetter. Cut-offs are the JMA's own hourly-rainfall wording
 *  (やや強い 10 mm/h, 強い 20 mm/h, 激しい 30 mm/h, 非常に激しい 50 mm/h). */
export function rainColor(mm: number): string {
  if (mm <= 0) return 'var(--grid)';
  if (mm < 1) return 'var(--seq-100)';
  if (mm < 5) return 'var(--seq-250)';
  if (mm < 10) return 'var(--seq-400)';
  return 'var(--seq-550)';
}

/** Chance of rain shares the blue ramp so the two charts in the card read as
 *  one story, rather than implying a 90 % chance is "dangerous". */
export function popColor(pct: number): string {
  if (pct < 10) return 'var(--grid)';
  if (pct < 30) return 'var(--seq-100)';
  if (pct < 60) return 'var(--seq-250)';
  if (pct < 80) return 'var(--seq-400)';
  return 'var(--seq-550)';
}
