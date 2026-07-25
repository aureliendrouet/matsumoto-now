#!/usr/bin/env node
/**
 * Measured air quality (環境省そらまめくん, Soramame) → public/data/air.json
 *
 * Station 20202050 「松本」 (松本市島立, run by Nagano Prefecture) — the only
 * Matsumoto station measuring both PM2.5 and photochemical oxidants.
 * Near-real-time CSV (last 7 days, hourly, ~1.5 h delay, preliminary values):
 *   https://soramame.env.go.jp/data/sokutei/NoudoTime/20202050/7day.csv
 *
 * No CORS on soramame.env.go.jp, hence this scheduled fetch. Values are
 * 速報値 (preliminary, unvalidated) — the UI must say so.
 *
 * Semantics: hour column is 01–24, hour-ENDING, JST (row 15 = hour ending
 * 15:00; hour 24 belongs to the next day's 00:00). Blank = not measured,
 * "-" = invalid/under maintenance; both become null.
 *
 * Run: node scripts/fetch-air-data.mjs
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public/data/air.json');
const STATION = '20202050';
const URL = `https://soramame.env.go.jp/data/sokutei/NoudoTime/${STATION}/7day.csv`;
const KEEP_HOURS = 72;

function num(raw) {
  const v = raw?.trim();
  if (!v || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const res = await fetch(URL, {
    headers: { 'user-agent': 'matsumoto-now/1.0 (community dashboard; scheduled fetch 2x/hour)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(',').map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  const [iY, iM, iD, iH] = [col('年'), col('月'), col('日'), col('時')];
  const [iSo2, iNo2, iOx, iSpm, iPm25] = [col('SO2'), col('NO2'), col('OX'), col('SPM'), col('PM2.5')];
  if ([iY, iM, iD, iH, iPm25].includes(-1)) throw new Error('unexpected CSV header');

  const hours = [];
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const hour = Number(f[iH]);
    if (!Number.isInteger(hour)) continue;
    // hour-ending 01–24 → ISO instant; hour 24 = 00:00 of the following day
    const base = Date.UTC(Number(f[iY]), Number(f[iM]) - 1, Number(f[iD]), hour - 9); // JST→UTC
    const time = new Date(base).toISOString();
    hours.push({
      time,
      so2: num(f[iSo2]),
      no2: num(f[iNo2]),
      ox: num(f[iOx]),
      spm: num(f[iSpm]),
      pm25: num(f[iPm25]),
    });
  }

  const out = {
    fetched: new Date().toISOString(),
    station: { code: STATION, name: '松本', operator: '長野県' },
    hours: hours.slice(-KEEP_HOURS),
  };
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  const last = out.hours[out.hours.length - 1];
  console.log(`wrote ${OUT}: ${out.hours.length} hours, latest ${last?.time} pm25=${last?.pm25}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
