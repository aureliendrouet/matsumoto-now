#!/usr/bin/env node
/**
 * Live fire / 119 information from 松本広域消防局 → public/data/fire.json
 *
 * Three sources, all public and crawlable (robots.txt allows all):
 *  - 災害発生状況 (incident feed, a static HTML fragment refreshed by the bureau's
 *    dispatch system): .../modules/jian.html — currently-burning fires plus a
 *    few weeks of past incidents, at 町丁目 level. The bureau strips exact
 *    addresses itself for privacy, and states not every dispatch is listed.
 *  - 指令件数 (119 dispatch counters, JSON, scopeable to Matsumoto City):
 *    .../modules/batch/ajax_find_shirei_data.php
 *  - 林野火災注意報・火災警報 (wildfire advisory / fire warning) from the public
 *    mirror of the bureau's alert-mail service, as RSS.
 *
 * NOTE ON PERMISSION: m-kouiki119.jp publishes no open-data licence or terms of
 * use. The `firePage` feature flag stays false until 松本広域消防局 confirms
 * republication is fine — same arrangement as `pollen` and `measuredAir`.
 *
 * All three refresh on the bureau's own ~20-minute batch, so this runs on the
 * existing 30-minute schedule.
 *
 * Run: node scripts/fetch-fire-data.mjs
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public/data/fire.json');
const INCIDENTS_URL = 'https://www.m-kouiki119.jp/wp-content/themes/mks/modules/jian.html';
const COUNTS_URL =
  'https://www.m-kouiki119.jp/wp-content/themes/mks/modules/batch/ajax_find_shirei_data.php';
const ADVISORY_URL = 'https://matsumoto-fd.site2.ktaiwork.jp/?feed=rss2';
const CITY = '松本市';

const UA = 'matsumoto-now/1.0 (community dashboard; 30-min fetch)';

/** Municipalities the bureau covers — used to split "松本市島内" into city + area. */
const CITIES = [
  '松本市',
  '塩尻市',
  '安曇野市',
  '山形村',
  '朝日村',
  '生坂村',
  '麻績村',
  '筑北村',
];

async function get(url, init = {}, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'user-agent': UA, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i >= tries) throw new Error(`${url}: ${err.message}`);
      console.error(`[retry ${i}] ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
}

/* ---- incident feed ------------------------------------------------------- */

/** JST calendar date, for inferring the year the feed omits. */
function jstToday() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => Number(p.find((x) => x.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** The feed gives MM月DD日 with no year: anything ahead of today is last year's. */
function toIso(month, day, hour, minute, today) {
  const year = month > today.m || (month === today.m && day > today.d) ? today.y - 1 : today.y;
  // JST is a fixed +09:00 offset, so the timestamp is unambiguous.
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+09:00`;
}

const LINE_RE = /(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時(\d{1,2})分頃、(.+?)\s*付近(.*)$/;

/** One "…付近で火災が発生。" / "…付近の火災は鎮火しました。" line → an event. */
function parseEvent(text, today) {
  const m = LINE_RE.exec(text);
  if (!m) return null;
  const [, mo, d, h, mi, place, tail] = m;
  const city = CITIES.find((c) => place.startsWith(c)) ?? null;
  const kind = /火災ではありません/.test(tail)
    ? 'notFire'
    : /鎮火/.test(tail)
      ? 'extinguished'
      : /で火災が発生/.test(tail)
        ? 'started'
        : 'other';
  return {
    at: toIso(Number(mo), Number(d), Number(h), Number(mi), today),
    city,
    area: city ? place.slice(city.length) : place,
    kind,
  };
}

/** Plain-text lines from one of the fragment's two <div> sections. */
function sectionLines(html, className) {
  const block = new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`).exec(html);
  if (!block) return [];
  return block[1]
    .split(/<li\b/)
    .map((chunk) =>
      chunk
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

/** Pair each ignition with its own later resolution at the same place. */
function pairIncidents(events) {
  const starts = events.filter((e) => e.kind === 'started').sort((a, b) => (a.at < b.at ? -1 : 1));
  const ends = events
    .filter((e) => e.kind === 'extinguished' || e.kind === 'notFire')
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  const used = new Set();

  const incidents = starts.map((s) => {
    const i = ends.findIndex(
      (e, idx) => !used.has(idx) && e.city === s.city && e.area === s.area && e.at >= s.at,
    );
    if (i !== -1) used.add(i);
    const end = i === -1 ? null : ends[i];
    return {
      start: s.at,
      city: s.city,
      area: s.area,
      end: end?.at ?? null,
      outcome: end?.kind ?? null,
    };
  });

  return incidents.sort((a, b) => (a.start < b.start ? 1 : -1));
}

async function fetchIncidents() {
  const res = await get(INCIDENTS_URL);
  const html = await res.text();
  const today = jstToday();

  const activeLines = sectionLines(html, 'nowjian');
  const noneNow = activeLines.some((l) => /災害は発生していません/.test(l));
  const active = noneNow
    ? []
    : activeLines
        .map((l) => parseEvent(l, today))
        .filter((e) => e && e.city === CITY && e.kind !== 'notFire')
        .map((e) => ({ at: e.at, city: e.city, area: e.area }));

  const past = sectionLines(html, 'oldjian')
    .map((l) => parseEvent(l, today))
    .filter((e) => e && e.city === CITY);

  return {
    sourceUpdated: res.headers.get('last-modified')
      ? new Date(res.headers.get('last-modified')).toISOString()
      : null,
    active,
    recent: pairIncidents(past).slice(0, 12),
  };
}

/* ---- 119 dispatch counters ---------------------------------------------- */

const COUNT_GROUPS = ['fire', 'emergency', 'rescue', 'other', 'total'];
const COUNT_SPANS = [
  ['today', 'today'],
  ['yesterday', 'yesterday'],
  ['month', 'this_month'],
  ['year', 'this_year'],
];

/** "2026年07月31日 21時20分" → ISO. */
function parseRetrievedAt(text) {
  const m = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時(\d{1,2})分/.exec(text ?? '');
  if (!m) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5])}:00+09:00`;
}

async function fetchCounts() {
  const res = await get(COUNTS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ selectCity: CITY }).toString(),
  });
  const { shireiData } = await res.json();
  if (!shireiData || !Object.keys(shireiData).length) throw new Error('empty shireiData');

  const groups = {};
  for (const g of COUNT_GROUPS) {
    groups[g] = Object.fromEntries(
      COUNT_SPANS.map(([out, src]) => [out, Number(shireiData[`${g}_${src}`] ?? 0)]),
    );
  }
  return { retrievedAt: parseRetrievedAt(shireiData.retrieved_at), ...groups };
}

/* ---- wildfire advisory / fire warning ----------------------------------- */

/** Latest 発令/解除 posting for each of the two alert kinds. */
async function fetchAdvisories() {
  const xml = await (await get(ADVISORY_URL)).text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

  const field = (item, name) => {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(item);
    if (!m) return '';
    return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  };

  const latest = {};
  for (const item of items) {
    const title = field(item, 'title');
    const kind = /林野火災注意報/.test(title)
      ? 'wildfire'
      : /火災警報/.test(title)
        ? 'fireWarning'
        : null;
    if (!kind || latest[kind]) continue; // feed is newest-first
    const issued = /【発令】/.test(title);
    if (!issued && !/【解除】/.test(title)) continue;
    const date = new Date(field(item, 'pubDate'));
    latest[kind] = {
      active: issued,
      changed: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      link: field(item, 'link') || null,
    };
  }
  return latest;
}

/* ---- main --------------------------------------------------------------- */

async function main() {
  // Independent sources: one being down should not lose the others.
  const [incidents, counts, advisories] = await Promise.all([
    fetchIncidents().catch((err) => {
      console.error(`[warn] incidents: ${err.message}`);
      return null;
    }),
    fetchCounts().catch((err) => {
      console.error(`[warn] counts: ${err.message}`);
      return null;
    }),
    fetchAdvisories().catch((err) => {
      console.error(`[warn] advisories: ${err.message}`);
      return null;
    }),
  ]);

  if (!incidents && !counts && !advisories) throw new Error('all fire sources failed');

  const out = {
    fetched: new Date().toISOString(),
    sourceUpdated: incidents?.sourceUpdated ?? null,
    city: CITY,
    active: incidents?.active ?? null,
    recent: incidents?.recent ?? null,
    counts,
    advisories: advisories ?? null,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(
    `wrote ${OUT}: ${out.active?.length ?? '?'} active, ${out.recent?.length ?? '?'} recent, ` +
      `counters ${counts ? 'ok' : 'failed'}, advisories ${Object.keys(advisories ?? {}).join(',') || 'none'}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
