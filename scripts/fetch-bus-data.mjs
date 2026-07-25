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
const OUT_TIMES = path.join(process.cwd(), 'public/data/bus-times.json');
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

/** "HH:MM:SS" → minutes since midnight (GTFS allows hours ≥ 24 for
 *  after-midnight departures of the previous service day). */
function toMinutes(hms) {
  const [h, m] = hms.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

async function main() {
  const routes = [];
  const stopsByKey = new Map();

  // departure-times sidecar (bus-times.json), aligned to the stops order
  const timeRouteNames = [];
  const timeRouteIdx = new Map(); // route display name -> index
  const services = [];
  const serviceIdx = new Map(); // `${feed}:${service_id}` -> index
  const stopDepartures = []; // clusterIdx -> Map("r|s" -> minutes[])

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

    const clusterByStopId = new Map(); // this feed's stop_id -> cluster index
    for (const f of stopsGeo.features) {
      const [lon, lat] = f.geometry.coordinates;
      const name = f.properties.stop_name;
      // one marker per named stop cluster (multiple poles share a name nearby)
      const key = `${name}|${lat.toFixed(3)},${lon.toFixed(3)}`;
      if (!stopsByKey.has(key)) {
        stopsByKey.set(key, {
          idx: stopsByKey.size,
          name,
          nameEn: enByStopId.get(f.properties.stop_id) ?? null,
          lat: round5(lat),
          lon: round5(lon),
        });
        stopDepartures.push(new Map());
      }
      clusterByStopId.set(f.properties.stop_id, stopsByKey.get(key).idx);
    }

    /* ---- departure times (stop_times + trips + calendar) ---- */
    const trips = parseCsv(dec.decode(zip['trips.txt']));
    const calendar = parseCsv(dec.decode(zip['calendar.txt']));
    const calDates = zip['calendar_dates.txt'] ? parseCsv(dec.decode(zip['calendar_dates.txt'])) : [];
    const nameByRouteId = new Map(
      routesTxt.map((r) => [r.route_id, r.route_long_name || r.route_short_name || r.route_id]),
    );

    for (const c of calendar) {
      const key = `${feed.id}:${c.service_id}`;
      if (serviceIdx.has(key)) continue;
      serviceIdx.set(key, services.length);
      services.push({
        days: [c.sunday, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday].map(
          (v) => v === '1',
        ),
        start: c.start_date,
        end: c.end_date,
        add: [],
        del: [],
      });
    }
    for (const cd of calDates) {
      const key = `${feed.id}:${cd.service_id}`;
      if (!serviceIdx.has(key)) {
        // service defined only via calendar_dates
        serviceIdx.set(key, services.length);
        services.push({ days: [false, false, false, false, false, false, false], start: '19000101', end: '20991231', add: [], del: [] });
      }
      const svc = services[serviceIdx.get(key)];
      (cd.exception_type === '1' ? svc.add : svc.del).push(cd.date);
    }

    const tripInfo = new Map(
      trips.map((tr) => [
        tr.trip_id,
        {
          route: nameByRouteId.get(tr.route_id) ?? tr.route_id,
          service: serviceIdx.get(`${feed.id}:${tr.service_id}`),
        },
      ]),
    );
    const stopTimes = parseCsv(dec.decode(zip['stop_times.txt']));
    for (const st of stopTimes) {
      if (st.pickup_type === '1') continue; // drop-off only, no boarding
      const info = tripInfo.get(st.trip_id);
      const cluster = clusterByStopId.get(st.stop_id);
      const minutes = toMinutes(st.departure_time || st.arrival_time || '');
      if (!info || info.service === undefined || cluster === undefined || minutes === null) continue;
      if (!timeRouteIdx.has(info.route)) {
        timeRouteIdx.set(info.route, timeRouteNames.length);
        timeRouteNames.push(info.route);
      }
      const rs = `${timeRouteIdx.get(info.route)}|${info.service}`;
      const bucket = stopDepartures[cluster];
      if (!bucket.has(rs)) bucket.set(rs, []);
      bucket.get(rs).push(minutes);
    }

    console.log(`${feed.id}: ${routesGeo.features.length} routes, ${stopsGeo.features.length} stop poles, ${stopTimes.length} stop_times`);
  }

  const out = {
    fetched: new Date().toISOString(),
    attribution: '松本市 (Matsumoto City), CC BY 4.0, via GTFSデータリポジトリ (gtfs-data.jp)',
    routes,
    stops: [...stopsByKey.values()].map(({ idx, ...stop }) => stop),
  };
  await writeFile(OUT, JSON.stringify(out) + '\n');
  const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
  console.log(`wrote ${OUT}: ${routes.length} routes, ${stopsByKey.size} stops, ${kb} KB`);

  // sidecar: departures per stop, aligned to the stops array order above
  const times = {
    fetched: out.fetched,
    routes: timeRouteNames,
    services,
    stops: stopDepartures.map((bucket) =>
      [...bucket.entries()].map(([rs, minutes]) => {
        const [r, s] = rs.split('|').map(Number);
        return [r, s, minutes.sort((a, b) => a - b)];
      }),
    ),
  };
  await writeFile(OUT_TIMES, JSON.stringify(times) + '\n');
  const tkb = Math.round(Buffer.byteLength(JSON.stringify(times)) / 1024);
  console.log(`wrote ${OUT_TIMES}: ${services.length} services, ${tkb} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
