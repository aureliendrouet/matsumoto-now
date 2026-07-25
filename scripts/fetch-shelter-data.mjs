#!/usr/bin/env node
/**
 * Evacuation sites & AED locations → public/data/shelters.json
 *
 * - 指定緊急避難場所 (emergency evacuation sites, with per-hazard flags) from the
 *   GSI nationwide dataset, Matsumoto city code 20202:
 *   https://hinanmap.gsi.go.jp/hinanjocp/defaultFtpData/geoJSON/20202_2.geojson
 *   License: GSI terms (政府標準利用規約, CC BY 4.0-compatible), attribution 国土地理院.
 * - AED locations from Matsumoto City open data (CC BY 4.0):
 *   https://www2.wagmap.jp/matsumoto/matsumoto/opendata/map_3/CSV/opendata_30.csv
 *
 * Designations change rarely — run monthly. The GSI server can be flaky, so
 * fetches retry; on repeated failure the previous JSON is kept (script fails,
 * nothing is overwritten).
 *
 * Run: node scripts/fetch-shelter-data.mjs
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public/data/shelters.json');
const GSI_URL = 'https://hinanmap.gsi.go.jp/hinanjocp/defaultFtpData/geoJSON/20202_2.geojson';
const AED_URL = 'https://www2.wagmap.jp/matsumoto/matsumoto/opendata/map_3/CSV/opendata_30.csv';

const HAZARDS = [
  ['flood', '洪水'],
  ['landslide', '崖崩れ、土石流及び地滑り'],
  ['earthquake', '地震'],
  ['fire', '大規模な火事'],
  ['volcano', '火山現象'],
];

const round5 = (v) => Math.round(v * 1e5) / 1e5;

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'matsumoto-now/1.0 (community dashboard; monthly fetch)' },
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (i >= tries) throw new Error(`${url}: ${err.message}`);
      console.error(`[retry ${i}] ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}

function decodeUtf8(buf) {
  const skip = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
  return new TextDecoder('utf-8').decode(buf.subarray(skip));
}

function parseCsv(text) {
  // quote-aware, handles quoted fields on one line (this data has no embedded newlines)
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const parseLine = (line) => {
    const fields = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') fields.push(cur), (cur = '');
      else cur += ch;
    }
    fields.push(cur);
    return fields;
  };
  const header = parseLine(lines[0]);
  return lines.slice(1).map((l) => {
    const f = parseLine(l);
    return Object.fromEntries(header.map((h, i) => [h, (f[i] ?? '').trim()]));
  });
}

async function main() {
  const geo = JSON.parse(decodeUtf8(await get(GSI_URL)));
  const shelters = geo.features
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      return {
        name: p['施設・場所名'],
        address: p['住所'],
        lat: round5(lat),
        lon: round5(lon),
        hazards: HAZARDS.filter(([, col]) => p[col] === '1').map(([key]) => key),
      };
    })
    .filter((s) => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lon));

  const aedRows = parseCsv(decodeUtf8(await get(AED_URL)));
  const aeds = aedRows
    .map((r) => {
      const days = r['利用可能曜日'];
      const open = r['開始時間'];
      const close = r['終了時間'];
      const always = days === '月、火、水、木、金、土、日' && open === '0:00' && close === '24:00';
      return {
        name: r['名称'],
        place: r['設置位置'] || null,
        hours: always ? '24h' : [days, open && close ? `${open}–${close}` : ''].filter(Boolean).join(' '),
        lat: round5(Number(r['緯度'])),
        lon: round5(Number(r['経度'])),
      };
    })
    .filter((a) => a.name && Number.isFinite(a.lat) && Number.isFinite(a.lon));

  const out = { fetched: new Date().toISOString(), shelters, aeds };
  await writeFile(OUT, JSON.stringify(out) + '\n');
  console.log(`wrote ${OUT}: ${shelters.length} evacuation sites, ${aeds.length} AEDs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
