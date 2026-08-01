#!/usr/bin/env node
/**
 * 火災発生状況 (yearly fire statistics) from 松本広域消防局 → public/data/fire-stats.json
 *
 * https://www.m-kouiki119.jp/sonae/kasaiyobo/kasai-hassei/ — three HTML tables,
 * no CSV/Excel export is offered, so they are scraped:
 *   0) five-year series: fire count, count by type, deaths, injuries
 *   1) leading causes of fire, latest three years side by side
 *   2) latest year broken down by municipality (Matsumoto is one row)
 *
 * Updated once a year, so this runs on the monthly schedule. See the permission
 * note in fetch-fire-data.mjs — the `firePage` flag gates both.
 *
 * Run: node scripts/fetch-fire-stats.mjs
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public/data/fire-stats.json');
const URL_STATS = 'https://www.m-kouiki119.jp/sonae/kasaiyobo/kasai-hassei/';
const CITY = '松本市';

/** Row labels in tables 0 and 2 → output keys. */
const TYPE_KEYS = [
  ['building', '建物火災'],
  ['forest', '林野火災'],
  ['vehicle', '車両火災'],
  ['other', 'その他の火災'],
];

/** Cause labels the bureau uses, mapped to translatable keys. */
const CAUSE_KEYS = [
  ['openBurning', 'たき火'],
  ['fieldBurning', '火入れ'],
  ['cigarette', 'たばこ'],
  ['heater', 'ストーブ'],
  ['cooking', 'こんろ'],
  ['electrical', '電気'],
  ['arson', '放火'],
  ['sparks', '火の粉'],
  ['other', 'その他'],
  ['unknown', '不明'],
];

const stripTags = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Cell text for every row of every table on the page. */
function parseTables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((t) =>
    [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((tr) =>
      [...tr[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => stripTags(c[1])),
    ),
  );
}

/** "148" / "148件" → 148; "－" (no incidents) → 0; anything else → null. */
function num(text) {
  const m = /-?\d+/.exec((text ?? '').replace(/,/g, ''));
  if (m) return Number(m[0]);
  return /[－−–—-]/.test(text ?? '') ? 0 : null;
}

/** 令和7年 → 2025 (令和1 = 2019). */
function eraToYear(text) {
  const m = /令和\s*(\d+)\s*年/.exec(text ?? '');
  return m ? 2018 + Number(m[1]) : null;
}

const causeKeyFor = (label) => CAUSE_KEYS.find(([, ja]) => label.includes(ja))?.[0] ?? null;

/** Table 0: header row of 令和N年 columns, then one labelled row per measure. */
function parseSeries(rows) {
  const years = rows[0].map(eraToYear).filter((y) => y !== null);
  if (!years.length) throw new Error('no 令和 year columns in the series table');

  const series = {};
  const put = (key, cells) => {
    // Rows carry a trailing run of one value per year; type rows have an extra
    // leading label cell ("火災種別 | 建物火災 | 73 | …").
    const vals = cells.slice(cells.length - years.length).map(num);
    series[key] = vals;
  };

  for (const row of rows.slice(1)) {
    const label = row.join(' ');
    if (/火災件数/.test(label)) put('total', row);
    else if (/死者/.test(label)) put('deaths', row);
    else if (/負傷者/.test(label)) put('injuries', row);
    else {
      const type = TYPE_KEYS.find(([, ja]) => label.includes(ja));
      if (type) put(type[0], row);
    }
  }
  if (!series.total) throw new Error('no 火災件数 row in the series table');
  return { years, series };
}

/** Table 1: three years side by side as (label, count) pairs — take the last. */
function parseCauses(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  if (width < 2) return [];
  // Trailing pair of columns = most recent year.
  const causes = [];
  for (const row of rows) {
    if (row.length < width) continue; // the 令和N年 header row is narrower
    const label = row[width - 2];
    const count = num(row[width - 1]);
    if (!label || count === null || /^計$/.test(label)) continue;
    causes.push({ key: causeKeyFor(label), raw: label, count });
  }
  return causes.sort((a, b) => b.count - a.count);
}

/** Table 2: one row per municipality, plus a 計 total row. */
function parseByMunicipality(rows) {
  const header = rows[0] ?? [];
  const colFor = (ja) => header.findIndex((h) => h.includes(ja));
  const iTotal = colFor('火災件数');
  const iDeaths = colFor('死者');
  const iInjuries = colFor('負傷者');
  const typeCols = TYPE_KEYS.map(([key, ja]) => [key, colFor(ja)]);

  const read = (row) => {
    const out = { total: iTotal === -1 ? null : num(row[iTotal]) };
    for (const [key, i] of typeCols) out[key] = i === -1 ? null : num(row[i]);
    out.deaths = iDeaths === -1 ? null : num(row[iDeaths]);
    out.injuries = iInjuries === -1 ? null : num(row[iInjuries]);
    return out;
  };

  const find = (label) => rows.slice(1).find((r) => r[0] === label);
  const city = find(CITY);
  const region = find('計');
  return {
    matsumoto: city ? read(city) : null,
    region: region ? read(region) : null,
  };
}

async function main() {
  const res = await fetch(URL_STATS, {
    headers: { 'user-agent': 'matsumoto-now/1.0 (community dashboard; monthly fetch)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${URL_STATS}`);
  const tables = parseTables(await res.text());
  if (tables.length < 3) throw new Error(`expected 3 tables, found ${tables.length}`);

  const { years, series } = parseSeries(tables[0]);
  const causes = parseCauses(tables[1]);
  const { matsumoto, region } = parseByMunicipality(tables[2]);

  const unmapped = causes.filter((c) => !c.key).map((c) => c.raw);
  if (unmapped.length) console.error(`[warn] unmapped cause labels: ${unmapped.join(', ')}`);

  const out = {
    fetched: new Date().toISOString(),
    years,
    latestYear: years[years.length - 1],
    series,
    causes,
    matsumoto,
    region,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(
    `wrote ${OUT}: ${years[0]}–${out.latestYear}, ${causes.length} causes, ` +
      `Matsumoto ${matsumoto?.total ?? '?'} fires`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
