#!/usr/bin/env node
/**
 * Matsumoto city-bus network (ぐるっとまつもとバス) → public/data/bus.json
 *
 * Sources: the two Matsumoto City GTFS-JP feeds on the GTFS data repository
 * (gtfs-data.jp), CC BY 4.0. The uid-less API URLs always resolve to the
 * currently valid feed version, so there is nothing to pin:
 *   https://api.gtfs-data.jp/v2/organizations/matsumotocity/feeds/<feed>/files/...
 *
 * Route shapes come from routes.geojson, enriched with per-route colors from
 * routes.txt and English stop names from translations.txt inside feed.zip.
 * Geometry is simplified (Douglas-Peucker) — for a city overview map, not
 * navigation. Feeds change a few times a year; run monthly.
 *
 * Run: node scripts/fetch-bus-data.mjs
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

const OUT = path.join(process.cwd(), 'public/data/bus.json');
const API = 'https://api.gtfs-data.jp/v2/organizations/matsumotocity/feeds';
const FEEDS = [
  { id: 'guruttomatsumotobus1', key: 'station' }, // lines from Matsumoto Sta. / bus terminal
  { id: 'guruttomatsumotobus2', key: 'regional' }, // Town Sneaker + regional community lines
];

const UA = { 'user-agent': 'matsumoto-now/1.0 (community dashboard; monthly fetch)' };

async function get(url, as = 'json') {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return as === 'json' ? res.json() : new Uint8Array(await res.arrayBuffer());
}

/** Minimal quote-aware CSV: GTFS text files, one record per line. */
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
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
    return Object.fromEntries(header.map((h, i) => [h, f[i] ?? '']));
  });
}

/* ---- geometry ----------------------------------------------------------- */

const round5 = (v) => Math.round(v * 1e5) / 1e5;

/** Douglas-Peucker on [lon, lat] points; tolerance in degrees (~5e-5 ≈ 5 m). */
function simplify(points, tol) {
  if (points.length <= 2) return points;
  const sqTol = tol * tol;
  const sqSegDist = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let idx = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > sqTol) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** GTFS-derived MultiLineStrings arrive chopped into many short segments;
 *  stitch consecutive ones back together so simplification can work. */
function stitch(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev) {
      const [lastLon, lastLat] = prev[prev.length - 1];
      const [firstLon, firstLat] = line[0];
      if (lastLon === firstLon && lastLat === firstLat) {
        prev.push(...line.slice(1));
        continue;
      }
    }
    out.push([...line]);
  }
  return out;
}

/* ---- main --------------------------------------------------------------- */

async function main() {
  const routes = [];
  const stopsByKey = new Map();

  for (const feed of FEEDS) {
    const base = `${API}/${feed.id}/files`;
    const [routesGeo, stopsGeo, zipBuf] = await Promise.all([
      get(`${base}/routes.geojson`),
      get(`${base}/stops.geojson`),
      get(`${base}/feed.zip`, 'buffer'),
    ]);

    const zip = unzipSync(zipBuf);
    const dec = new TextDecoder('utf-8');
    const routesTxt = parseCsv(dec.decode(zip['routes.txt']));
    const translations = parseCsv(dec.decode(zip['translations.txt']));

    const colorById = new Map(
      routesTxt.map((r) => [r.route_id, r.route_color ? `#${r.route_color}` : null]),
    );
    const enByStopId = new Map(
      translations
        .filter((t) => t.table_name === 'stops' && t.field_name === 'stop_name' && t.language === 'en')
        .map((t) => [t.record_id, t.translation]),
    );

    for (const f of routesGeo.features) {
      const lines =
        f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      // the feed repeats each route's shape once per trip — keep unique segments only
      const seen = new Set();
      const unique = lines.filter((line) => {
        const key = JSON.stringify(line);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const paths = stitch(unique)
        .map((line) => simplify(line, 5e-5).map(([lon, lat]) => [round5(lat), round5(lon)]))
        .filter((line) => line.length >= 2);
      if (!paths.length) continue;
      routes.push({
        name: f.properties.route_name,
        color: colorById.get(f.properties.id) ?? null,
        feed: feed.key,
        paths,
      });
    }

    for (const f of stopsGeo.features) {
      const [lon, lat] = f.geometry.coordinates;
      const name = f.properties.stop_name;
      // one marker per named stop cluster (multiple poles share a name nearby)
      const key = `${name}|${lat.toFixed(3)},${lon.toFixed(3)}`;
      if (stopsByKey.has(key)) continue;
      stopsByKey.set(key, {
        name,
        nameEn: enByStopId.get(f.properties.stop_id) ?? null,
        lat: round5(lat),
        lon: round5(lon),
      });
    }
    console.log(`${feed.id}: ${routesGeo.features.length} routes, ${stopsGeo.features.length} stop poles`);
  }

  const out = {
    fetched: new Date().toISOString(),
    attribution: '松本市 (Matsumoto City), CC BY 4.0, via GTFSデータリポジトリ (gtfs-data.jp)',
    routes,
    stops: [...stopsByKey.values()],
  };
  await writeFile(OUT, JSON.stringify(out) + '\n');
  const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
  console.log(`wrote ${OUT}: ${routes.length} routes, ${stopsByKey.size} stops, ${kb} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
