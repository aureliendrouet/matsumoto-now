#!/usr/bin/env node
/**
 * Heat index (暑さ指数 WBGT) and heat alerts → public/data/heat.json
 *
 * Source: 環境省 熱中症予防情報サイト (wbgt.env.go.jp). Three feeds, all for
 * Matsumoto AMeDAS point 48361 / Nagano prefecture:
 *
 *   observed   est15WG/dl/wbgt_48361_YYYYMM.csv   hourly, one file per month
 *   forecast   prev15WG/dl/yohou_48361.csv        3-hourly, 3 days ahead
 *   alerts     alert/dl/YYYY/alert_YYYYMMDD_HH.csv  issued at 05/10/14/17 JST
 *
 * Units differ between the two WBGT files, which is easy to miss: the forecast
 * is in tenths of a degree (290 = 29.0 °C), the observed file is already in
 * degrees (22.5).
 *
 * Licence: 公共データ利用規約 第1.0版 (PDL 1.0) — free reuse with attribution
 * 「出典: 環境省」. The ministry publishes this service specifically so third
 * parties can republish the figures, and it is registered on data.go.jp, so no
 * individual permission is needed (unlike the fire bureau feeds).
 *
 * Seasonal: the service runs from the fourth Wednesday of April to 21 October.
 * Outside that window every endpoint 404s — that is normal, and the file is
 * written with season:false so the page can say so rather than show an error.
 *
 * No CORS headers on wbgt.env.go.jp, hence this scheduled fetch.
 *
 * Run: node scripts/fetch-heat-data.mjs
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public/data/heat.json');
const POINT = '48361'; // 松本
const PREF = '長野県';
const PREF_CODE = '200000'; // 府県予報区等コード, Nagano
const BASE = 'https://www.wbgt.env.go.jp';
const UA = {
  'user-agent': 'matsumoto-now/1.0 (community dashboard; scheduled fetch 2x/hour)',
};
const KEEP_HOURS = 48;

const jst = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000);
const pad = (n) => String(n).padStart(2, '0');

async function getText(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** forecast files carry tenths of a degree, observed files plain degrees */
function wbgt(raw, tenths) {
  const v = raw?.trim();
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return tenths ? n / 10 : n;
}

/** "2026080115" (JST) → ISO instant */
function stampToIso(s) {
  const t = s.trim();
  return new Date(
    `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:00:00+09:00`,
  ).toISOString();
}

/* ---- observed: hourly, current month ------------------------------------ */

function parseObserved(csv) {
  const rows = csv.trim().split(/\r?\n/).slice(1); // Date,Time,<point>
  const hours = [];
  for (const line of rows) {
    const [date, time, value] = line.split(',');
    if (!date || !time) continue;
    const v = wbgt(value, false);
    if (v === null) continue; // future hours in the month file are blank
    // "24:00" means midnight ending that day, i.e. 00:00 the next day
    const [y, m, d] = date.split('/').map(Number);
    const h = Number(time.split(':')[0]);
    hours.push({ time: new Date(Date.UTC(y, m - 1, d, h - 9, 0, 0)).toISOString(), wbgt: v });
  }
  return hours;
}

async function fetchObserved(now) {
  const file = (d) =>
    `${BASE}/est15WG/dl/wbgt_${POINT}_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}.csv`;
  let hours = parseObserved(await getText(file(now)));
  // On the first days of a month the month file holds only a few hours, so the
  // chart would be nearly empty; top it up from the previous month.
  if (hours.length < KEEP_HOURS) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    try {
      hours = [...parseObserved(await getText(file(prev))), ...hours];
    } catch {
      /* previous month may predate the season — the short series is fine */
    }
  }
  return hours.slice(-KEEP_HOURS);
}

/* ---- forecast: 3-hourly, three days ------------------------------------- */

async function fetchForecast() {
  const csv = await getText(`${BASE}/prev15WG/dl/yohou_${POINT}.csv`);
  const [head, row] = csv.trim().split(/\r?\n/);
  if (!head || !row) throw new Error('forecast: unexpected shape');
  const stamps = head.split(',').slice(2);
  const values = row.split(',');
  const reported = values[1]?.trim() ?? null;
  const out = [];
  stamps.forEach((stamp, i) => {
    const v = wbgt(values[i + 2], true);
    if (v !== null && stamp.trim()) out.push({ time: stampToIso(stamp), wbgt: v });
  });
  return { reported, hours: out };
}

/* ---- alerts: 熱中症警戒アラート / 特別警戒アラート ------------------------ */

/** Flags per the file's own FlagExplanation row: 0 = none, 1 = 熱中症警戒情報,
 *  2 = 熱中症特別警戒情報, 9 = not yet determined (tomorrow, early issues). */
async function fetchAlert(now) {
  const ymd = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  // newest issue first; before 05:00 fall back to yesterday's last one
  const tries = [
    ...['17', '14', '10', '05'].map((h) => [ymd, h]),
    ...(() => {
      const y = new Date(now.getTime() - 86400000);
      const s = `${y.getUTCFullYear()}${pad(y.getUTCMonth() + 1)}${pad(y.getUTCDate())}`;
      return [[s, '17']];
    })(),
  ];
  for (const [day, hour] of tries) {
    try {
      const csv = await getText(`${BASE}/alert/dl/${day.slice(0, 4)}/alert_${day}_${hour}.csv`);
      const lines = csv.trim().split(/\r?\n/);
      const meta = {};
      for (const line of lines) {
        const [k, v] = line.split(',');
        if (k && v && /^[A-Za-z]/.test(k)) meta[k] = v.trim();
      }
      const row = lines
        .map((l) => l.split(','))
        .find((f) => f[0] === PREF && f[3] === PREF_CODE);
      if (!row) continue;
      const flag = (s) => {
        const n = Number(s);
        return Number.isFinite(n) ? n : 9;
      };
      // per-point daily-max WBGT lists, e.g. "松本:29/奈川:28/…"; the three
      // columns are the 10:00, 17:00 and 05:00 issues, so take the first that
      // actually carries our point
      const peak = (() => {
        for (const col of [row[8], row[9], row[10]]) {
          const hit = col?.split('/').find((p) => p.startsWith('松本:'));
          if (hit) {
            const n = Number(hit.split(':')[1]);
            if (Number.isFinite(n)) return n;
          }
        }
        return null;
      })();
      return {
        today: flag(row[6]),
        tomorrow: flag(row[7]),
        peakToday: peak,
        reportDate: meta.ReportDate ?? null,
        reportTime: meta.ReportTime ?? null,
        targetDate: meta.TargetDate1 ?? null,
      };
    } catch {
      /* that issue isn't out yet — try an earlier one */
    }
  }
  return null;
}

/* ---- main ---------------------------------------------------------------- */

async function main() {
  const now = jst();
  let observed = [];
  let forecast = { reported: null, hours: [] };
  let alert = null;
  let season = true;

  try {
    [observed, forecast] = await Promise.all([fetchObserved(now), fetchForecast()]);
  } catch (err) {
    // Every endpoint 404s outside 22 Apr – 21 Oct. Distinguish that from a real
    // outage by the status: a 404 in the off-season is expected.
    if (String(err.message).includes('HTTP 404')) {
      season = false;
      console.log('heat index: out of season (endpoints 404) — writing season:false');
    } else {
      throw err;
    }
  }
  if (season) alert = await fetchAlert(now);

  const out = {
    fetched: new Date().toISOString(),
    season,
    source: '環境省 熱中症予防情報サイト',
    point: { code: POINT, name: '松本' },
    current: observed[observed.length - 1] ?? null,
    observed,
    forecast: forecast.hours,
    alert,
  };
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(
    `wrote ${OUT}: season=${season} current=${out.current?.wbgt ?? '—'} ` +
      `forecast=${out.forecast.length} pts alert=${alert ? `today ${alert.today}/tomorrow ${alert.tomorrow}` : 'none'}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
