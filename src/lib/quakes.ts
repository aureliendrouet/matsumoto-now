/** P2P地震情報 (p2pquake.net) v2 API — JMA earthquake reports.
 *  Free for reuse incl. commercial; rate limit: /history 60 req/min/IP. */

import type { Lang } from '../i18n/ui';

export interface Quake {
  id: string;
  time: Date;
  epicenterJa: string;
  magnitude: number | null;
  depthKm: number | null;
  maxScale: number; // JMA scale ×10 (45 = 5弱), -1 = unknown
  lat: number | null;
  lon: number | null;
  feltNagano: boolean;
  matsumotoScale: number | null; // max intensity observed in Matsumoto City (×10)
}

interface P2pPoint {
  pref?: string;
  addr?: string;
  scale?: number;
}

interface P2pItem {
  id?: string;
  _id?: string;
  earthquake?: {
    time?: string;
    maxScale?: number;
    hypocenter?: {
      name?: string;
      latitude?: number;
      longitude?: number;
      magnitude?: number;
      depth?: number;
    };
  };
  points?: P2pPoint[];
}

export async function fetchQuakes(limit = 20): Promise<Quake[]> {
  const res = await fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=${limit}`);
  if (!res.ok) throw new Error(`p2pquake ${res.status}`);
  const items: P2pItem[] = await res.json();

  return items
    .map((item): Quake | null => {
      const eq = item.earthquake;
      if (!eq?.time) return null;
      // p2pquake timestamps look like "2026/07/25 09:41:00" (JST)
      const time = new Date(eq.time.replace(/\//g, '-').replace(' ', 'T') + '+09:00');
      if (Number.isNaN(time.getTime())) return null;
      const hypo = eq.hypocenter ?? {};
      // p2pquake uses -1 / -200 sentinels for unknown values
      const num = (v: number | undefined): number | null =>
        typeof v === 'number' && v >= 0 ? v : null;
      const coord = (v: number | undefined): number | null =>
        typeof v === 'number' && v > -100 ? v : null;
      return {
        id: item.id ?? item._id ?? eq.time,
        time,
        epicenterJa: hypo.name || '—',
        magnitude: num(hypo.magnitude),
        depthKm: num(hypo.depth),
        maxScale: eq.maxScale ?? -1,
        lat: coord(hypo.latitude),
        lon: coord(hypo.longitude),
        feltNagano: (item.points ?? []).some((p) => p.pref === '長野県'),
        matsumotoScale: (item.points ?? [])
          .filter((p) => p.pref === '長野県' && p.addr?.startsWith('松本市'))
          .reduce<number | null>((max, p) => {
            const s = typeof p.scale === 'number' && p.scale > 0 ? p.scale : null;
            return s !== null && (max === null || s > max) ? s : max;
          }, null),
      };
    })
    .filter((q): q is Quake => q !== null);
}

/** JMA seismic intensity label from maxScale (×10). */
/** JMA event IDs from the bosai quake list, keyed by origin-minute + epicenter
 *  name — both fields also appear in the p2pquake records (same JMA source),
 *  so recent quakes can link to their official JMA detail view. */
export async function fetchJmaEventIds(): Promise<Map<string, string>> {
  const res = await fetch('https://www.jma.go.jp/bosai/quake/data/list.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`quake list ${res.status}`);
  const list: { eid?: string; at?: string; anm?: string }[] = await res.json();
  const map = new Map<string, string>();
  for (const entry of list) {
    if (!entry.eid || !entry.at || !entry.anm) continue;
    map.set(`${entry.anm}|${entry.at.slice(0, 16)}`, entry.eid);
  }
  return map;
}

/** Key for fetchJmaEventIds lookup; time must be the quake's origin time. */
export function jmaEventKey(q: Quake): string {
  // origin time back to "YYYY-MM-DDTHH:MM" in JST
  const jst = new Date(q.time.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16);
  return `${q.epicenterJa}|${jst}`;
}

export function jmaQuakeUrl(eid: string | undefined, lang: Lang): string {
  const base = 'https://www.jma.go.jp/bosai/map.html#contents=earthquake_map';
  const l = lang === 'ja' ? '' : '&lang=en';
  return eid ? `${base}&eid=${eid}${l}` : `${base}${l}`;
}

export function intensityLabel(maxScale: number, lang: Lang): string {
  const map: Record<number, [string, string]> = {
    10: ['1', '1'],
    20: ['2', '2'],
    30: ['3', '3'],
    40: ['4', '4'],
    45: ['5−', '5弱'],
    50: ['5+', '5強'],
    55: ['6−', '6弱'],
    60: ['6+', '6強'],
    70: ['7', '7'],
  };
  const row = map[maxScale];
  if (!row) return '—';
  return lang === 'ja' ? row[1] : row[0];
}
