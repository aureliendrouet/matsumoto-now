#!/usr/bin/env node
/**
 * Nagano Prefectural Police crime open data → public/data/crime.json
 *
 * Per-incident CSVs (seven street-crime categories, neighborhood level) from
 * https://www.pref.nagano.lg.jp/police/toukei/hanzai/opendata.html
 * License: CC BY 4.0-compatible (長野県警察オープンデータ利用規約).
 *
 * The data is updated once a year (~June), so this runs on a monthly schedule.
 * Filters to Matsumoto City and writes small aggregates only — no personal data.
 *
 * Run: node scripts/fetch-crime-data.mjs
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public/data/crime.json');
const BASE = 'https://www.pref.nagano.lg.jp/police/toukei/hanzai/documents';
const CITY = '松本市';

const CATEGORIES = [
  { key: 'bicycleTheft', type: 'zitensyatou' },
  { key: 'carBreakIn', type: 'syazyounerai' },
  { key: 'partsTheft', type: 'buhinnerai' },
  { key: 'carTheft', type: 'zidousyatou' },
  { key: 'motorcycleTheft', type: 'ootobaitou' },
  { key: 'snatching', type: 'hittakuri' },
  { key: 'vendingMachine', type: 'zidouhanbaikinerai' },
];

// Known filename typos on the police site (their page links these as-is).
const FILENAME_EXCEPTIONS = {
  '2024syazyounerai': 'nagano_20224syazyounerai.csv',
};

function fileUrl(year, type) {
  const name = FILENAME_EXCEPTIONS[`${year}${type}`] ?? `nagano_${year}${type}.csv`;
  return `${BASE}/${name}`;
}

/** Encoding varies by year: 2024 is UTF-8+BOM, 2025 is Shift_JIS. */
function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

/** Minimal quote-aware CSV parser (fields never span lines in this data). */
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function fetchCsv(year, type) {
  const url = fileUrl(year, type);
  const res = await fetch(url, {
    headers: { 'user-agent': 'matsumoto-now/1.0 (community dashboard; monthly fetch)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = decode(new Uint8Array(await res.arrayBuffer()));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const col = (name) => header.findIndex((h) => h === name);
  const iCity = col('市区町村（発生地）');
  const iArea = col('町丁目（発生地）');
  const iHour = col('発生時（始期）');
  if (iCity === -1) throw new Error(`missing city column in ${url}`);
  return lines.slice(1).map(parseCsvLine).filter((f) => f[iCity]?.trim() === CITY)
    .map((f) => ({
      area: iArea === -1 ? '' : (f[iArea]?.trim() ?? ''),
      hour: iHour === -1 ? NaN : Number.parseInt(f[iHour], 10),
    }));
}

/** Newest year whose bicycle-theft file exists (files appear ~June for the prior year). */
async function findLatestYear() {
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= thisYear - 2; y--) {
    const res = await fetch(fileUrl(y, 'zitensyatou'), {
      method: 'HEAD',
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return y;
  }
  throw new Error('no crime CSV found for recent years');
}

async function main() {
  const year = await findLatestYear();
  const prevYear = year - 1;

  const categories = [];
  let bikeRows = [];
  for (const { key, type } of CATEGORIES) {
    const rows = await fetchCsv(year, type);
    let prev = null;
    try {
      prev = (await fetchCsv(prevYear, type)).length;
    } catch (err) {
      console.error(`[warn] ${type} ${prevYear}: ${err.message}`);
    }
    categories.push({ key, count: rows.length, prev });
    if (key === 'bicycleTheft') bikeRows = rows;
    console.log(`${key}: ${rows.length} (${prevYear}: ${prev ?? '?'})`);
  }

  const areaCounts = new Map();
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const r of bikeRows) {
    if (r.area && r.area !== '不明') areaCounts.set(r.area, (areaCounts.get(r.area) ?? 0) + 1);
    if (Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23) hourCounts[r.hour]++;
  }
  const topAreas = [...areaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const out = { fetched: new Date().toISOString(), year, prevYear, categories, topAreas, byHour: hourCounts };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${OUT} (year ${year})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
