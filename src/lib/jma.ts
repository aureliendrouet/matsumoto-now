import type { Lang } from '../i18n/ui';
import { jstParts, pad2 } from './format';

/** Matsumoto AMeDAS station (松本特別地域気象観測所). */
const STATION = '48361';
/** JMA municipality codes for Matsumoto City in the Nagano warning feed. */
const MATSUMOTO_AREAS = ['2020201', '2020202'];

const BOSAI = 'https://www.jma.go.jp/bosai';

export interface AmedasNow {
  time: Date;
  temp: number | null;
  humidity: number | null;
  precipitation1h: number | null;
  windSpeed: number | null; // m/s
  windDirection: number | null; // 1–16, 0 = calm
  sun1h: number | null; // hours
  snow: number | null; // cm
}

const DIR_EN = ['—', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'];
const DIR_JA = ['静穏', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西', '北'];

export function windDirLabel(dir: number | null, lang: Lang): string {
  if (dir === null || dir < 0 || dir > 16) return '—';
  return lang === 'ja' ? DIR_JA[dir] : DIR_EN[dir];
}

function pick(field: unknown): number | null {
  // AMeDAS values arrive as [value, qualityFlag]; flag 0 = OK.
  if (Array.isArray(field) && typeof field[0] === 'number') return field[0];
  return null;
}

export async function fetchAmedasNow(): Promise<AmedasNow> {
  const latestRes = await fetch(`${BOSAI}/amedas/data/latest_time.txt`, { cache: 'no-store' });
  if (!latestRes.ok) throw new Error(`latest_time ${latestRes.status}`);
  const latest = new Date((await latestRes.text()).trim());

  const { y, m, d, h } = jstParts(latest);
  const block = Math.floor(h / 3) * 3;
  const url = `${BOSAI}/amedas/data/point/${STATION}/${y}${pad2(m)}${pad2(d)}_${pad2(block)}.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`amedas ${res.status}`);
  const data: Record<string, Record<string, unknown>> = await res.json();

  const keys = Object.keys(data).sort();
  const lastKey = keys[keys.length - 1];
  if (!lastKey) throw new Error('amedas: empty block');
  const row = data[lastKey]!;

  // key format: yyyyMMddHHmmss (JST)
  const time = new Date(
    `${lastKey.slice(0, 4)}-${lastKey.slice(4, 6)}-${lastKey.slice(6, 8)}T${lastKey.slice(8, 10)}:${lastKey.slice(10, 12)}:00+09:00`,
  );

  return {
    time,
    temp: pick(row.temp),
    humidity: pick(row.humidity),
    precipitation1h: pick(row.precipitation1h),
    windSpeed: pick(row.wind),
    windDirection: pick(row.windDirection),
    sun1h: pick(row.sun1h),
    snow: pick(row.snow),
  };
}

/* ---------------------------------------------------------------------- */

export type WarnLevel = 'advisory' | 'warning' | 'emergency';

export interface ActiveWarning {
  code: string;
  level: WarnLevel;
  en: string;
  ja: string;
}

/** JMA warning/advisory codes (bosai warning JSON). */
const WARN_CODES: Record<string, { level: WarnLevel; en: string; ja: string }> = {
  '02': { level: 'warning', en: 'Snowstorm warning', ja: '暴風雪警報' },
  '03': { level: 'warning', en: 'Heavy rain warning', ja: '大雨警報' },
  '04': { level: 'warning', en: 'Flood warning', ja: '洪水警報' },
  '05': { level: 'warning', en: 'Storm warning', ja: '暴風警報' },
  '06': { level: 'warning', en: 'Heavy snow warning', ja: '大雪警報' },
  '07': { level: 'warning', en: 'High wave warning', ja: '波浪警報' },
  '08': { level: 'warning', en: 'Storm surge warning', ja: '高潮警報' },
  '10': { level: 'advisory', en: 'Heavy rain advisory', ja: '大雨注意報' },
  '12': { level: 'advisory', en: 'Heavy snow advisory', ja: '大雪注意報' },
  '13': { level: 'advisory', en: 'Snow & wind advisory', ja: '風雪注意報' },
  '14': { level: 'advisory', en: 'Thunderstorm advisory', ja: '雷注意報' },
  '15': { level: 'advisory', en: 'Strong wind advisory', ja: '強風注意報' },
  '16': { level: 'advisory', en: 'High wave advisory', ja: '波浪注意報' },
  '17': { level: 'advisory', en: 'Snowmelt advisory', ja: '融雪注意報' },
  '18': { level: 'advisory', en: 'Flood advisory', ja: '洪水注意報' },
  '19': { level: 'advisory', en: 'Storm surge advisory', ja: '高潮注意報' },
  '20': { level: 'advisory', en: 'Dense fog advisory', ja: '濃霧注意報' },
  '21': { level: 'advisory', en: 'Dry air advisory', ja: '乾燥注意報' },
  '22': { level: 'advisory', en: 'Avalanche advisory', ja: 'なだれ注意報' },
  '23': { level: 'advisory', en: 'Low temperature advisory', ja: '低温注意報' },
  '24': { level: 'advisory', en: 'Frost advisory', ja: '霜注意報' },
  '25': { level: 'advisory', en: 'Icing advisory', ja: '着氷注意報' },
  '26': { level: 'advisory', en: 'Snow accretion advisory', ja: '着雪注意報' },
  '32': { level: 'emergency', en: 'Snowstorm emergency warning', ja: '暴風雪特別警報' },
  '33': { level: 'emergency', en: 'Heavy rain emergency warning', ja: '大雨特別警報' },
  '35': { level: 'emergency', en: 'Storm emergency warning', ja: '暴風特別警報' },
  '36': { level: 'emergency', en: 'Heavy snow emergency warning', ja: '大雪特別警報' },
  '37': { level: 'emergency', en: 'High wave emergency warning', ja: '波浪特別警報' },
  '38': { level: 'emergency', en: 'Storm surge emergency warning', ja: '高潮特別警報' },
};

export interface WarningsResult {
  reportTime: Date;
  active: ActiveWarning[];
}

interface WarningJson {
  reportDatetime: string;
  areaTypes?: { areas?: { code: string; warnings?: { code?: string; status?: string }[] }[] }[];
}

export async function fetchWarnings(): Promise<WarningsResult> {
  const res = await fetch(`${BOSAI}/warning/data/warning/200000.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`warning ${res.status}`);
  const data: WarningJson = await res.json();

  const found = new Map<string, ActiveWarning>();
  for (const areaType of data.areaTypes ?? []) {
    for (const area of areaType.areas ?? []) {
      if (!MATSUMOTO_AREAS.includes(area.code)) continue;
      for (const w of area.warnings ?? []) {
        const code = w.code;
        if (!code || code === '00' || w.status === '解除') continue;
        const def = WARN_CODES[code];
        const entry: ActiveWarning = def
          ? { code, ...def }
          : { code, level: 'advisory', en: `Advisory (code ${code})`, ja: `気象情報（コード${code}）` };
        found.set(code, entry);
      }
    }
  }

  const order: Record<WarnLevel, number> = { emergency: 0, warning: 1, advisory: 2 };
  const active = [...found.values()].sort((a, b) => order[a.level] - order[b.level]);
  return { reportTime: new Date(data.reportDatetime), active };
}
