/** Weathernews "Pollen Robo" open data — Matsumoto (city code 20202).
 *  CSV: citycode,date,pollen — hourly counts, -9999 = no observation.
 *  Attribution required; seasonal (roughly mid-Jan to early Aug). */

import { jstParts, pad2 } from './format';

export interface PollenHour {
  time: Date;
  count: number;
}

export async function fetchPollenToday(): Promise<PollenHour[]> {
  const { y, m, d } = jstParts(new Date());
  const ymd = `${y}${pad2(m)}${pad2(d)}`;
  const url = `https://wxtech.weathernews.com/opendata/v1/pollen?citycode=20202&start=${ymd}&end=${ymd}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pollen ${res.status}`);
  const text = await res.text();

  const rows: PollenHour[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split(',');
    if (cols.length < 3 || cols[0] === 'citycode') continue;
    const count = Number(cols[2]);
    if (!Number.isFinite(count) || count < 0) continue;
    const time = new Date(cols[1]!);
    if (Number.isNaN(time.getTime())) continue;
    rows.push({ time, count });
  }
  return rows;
}

export function pollenLevel(count: number): 'low' | 'medium' | 'high' | 'veryHigh' {
  if (count < 10) return 'low';
  if (count < 30) return 'medium';
  if (count < 50) return 'high';
  return 'veryHigh';
}
