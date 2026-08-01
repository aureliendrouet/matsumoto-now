import { locales, type Lang } from '../i18n/ui';
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

/** Compass labels live in the locale modules (index 0 = calm, 1–16 = NNE…N). */
export function windDirLabel(dir: number | null, lang: Lang): string {
  if (dir === null || dir < 0 || dir > 16) return '—';
  return locales[lang].dirs[dir] ?? locales.en.dirs[dir] ?? '—';
}

function pick(field: unknown): number | null {
  // AMeDAS values arrive as [value, qualityFlag]; flag 0 = OK.
  if (Array.isArray(field) && typeof field[0] === 'number') return field[0];
  return null;
}

/** The observation timestamp is shared by every station, so it is fetched once
 *  and reused when the station map asks for four points at the same moment. */
let latestTimeP: Promise<Date> | null = null;
function latestObservationTime(): Promise<Date> {
  latestTimeP ??= (async () => {
    const res = await fetch(`${BOSAI}/amedas/data/latest_time.txt`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`latest_time ${res.status}`);
    return new Date((await res.text()).trim());
  })();
  return latestTimeP;
}

export async function fetchAmedasNow(): Promise<AmedasNow> {
  return fetchStation(STATION);
}

/** Latest reading from any AMeDAS point. Stations report different elements —
 *  Kamikochi, for instance, has a rain gauge but no thermometer — so every
 *  field can legitimately be null. */
export async function fetchStation(station: string): Promise<AmedasNow> {
  const latest = await latestObservationTime();

  const { y, m, d, h } = jstParts(latest);
  const block = Math.floor(h / 3) * 3;
  const url = `${BOSAI}/amedas/data/point/${station}/${y}${pad2(m)}${pad2(d)}_${pad2(block)}.json`;
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
}

/** Labels live in the locale modules; English is the fallback. */
export function warningLabel(w: ActiveWarning, lang: Lang): string {
  return locales[lang].warnings[w.code] ?? locales.en.warnings[w.code] ?? `Code ${w.code}`;
}

/** Severity of each JMA warning/advisory code (bosai warning JSON). */
const WARN_LEVELS: Record<string, WarnLevel> = {
  '02': 'warning',
  '03': 'warning',
  '04': 'warning',
  '05': 'warning',
  '06': 'warning',
  '07': 'warning',
  '08': 'warning',
  '10': 'advisory',
  '12': 'advisory',
  '13': 'advisory',
  '14': 'advisory',
  '15': 'advisory',
  '16': 'advisory',
  '17': 'advisory',
  '18': 'advisory',
  '19': 'advisory',
  '20': 'advisory',
  '21': 'advisory',
  '22': 'advisory',
  '23': 'advisory',
  '24': 'advisory',
  '25': 'advisory',
  '26': 'advisory',
  '32': 'emergency',
  '33': 'emergency',
  '35': 'emergency',
  '36': 'emergency',
  '37': 'emergency',
  '38': 'emergency',
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
        found.set(code, { code, level: WARN_LEVELS[code] ?? 'advisory' });
      }
    }
  }

  const order: Record<WarnLevel, number> = { emergency: 0, warning: 1, advisory: 2 };
  const active = [...found.values()].sort((a, b) => order[a.level] - order[b.level]);
  return { reportTime: new Date(data.reportDatetime), active };
}
