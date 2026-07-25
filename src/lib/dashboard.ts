/** Dashboard hydration: fetches all live sources in parallel and renders widgets. */

import { ui, getLang, type Lang, type UIKey } from '../i18n/ui';
import { fmtTime, fmtDateShort, fmtWeekday, fmtDateTime, fmtNum } from './format';
import { fetchAmedasNow, fetchWarnings, windDirLabel, warningLabel } from './jma';
import { fetchForecast, fetchAirQuality, pm25Level, uvLevel, type Forecast } from './openmeteo';
import { fetchPollenToday, pollenLevel } from './pollen';
import { fetchQuakes, intensityLabel } from './quakes';
import { lineChart, barChart, chartMessage } from './chart';
import { wmoIcon, wmoLabel } from './wmo';

function widget(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-widget="${name}"]`);
}

function make(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const LEVEL_COLORS: Record<string, string> = {
  good: 'var(--status-good)',
  moderate: 'var(--status-warning)',
  elevated: 'var(--status-serious)',
  high: 'var(--status-critical)',
  low: 'var(--status-good)',
  medium: 'var(--status-warning)',
  veryHigh: 'var(--status-critical)',
  extreme: 'var(--status-critical)',
  advisory: 'var(--status-warning)',
  warning: 'var(--status-serious)',
  emergency: 'var(--status-critical)',
};

function badge(text: string, levelKey: string): HTMLElement {
  const b = make('span', 'badge');
  const dot = make('span', 'dot');
  dot.style.background = LEVEL_COLORS[levelKey] ?? 'var(--muted)';
  b.appendChild(dot);
  b.appendChild(document.createTextNode(text));
  return b;
}

function setUpdated(selector: string, d: Date, lang: Lang, t: (k: UIKey) => string): void {
  const node = document.querySelector<HTMLElement>(selector);
  if (node) node.textContent = `${t('common.updated')} ${fmtTime(d, lang)}`;
}

const decimal = (lang: Lang) => (v: number) =>
  Number.isInteger(v) ? fmtNum(v, lang) : fmtNum(v, lang, 1);

/* ---- widgets ----------------------------------------------------------- */

async function initWarnings(lang: Lang, t: (k: UIKey) => string): Promise<void> {
  const host = document.getElementById('warnings');
  if (!host) return;
  try {
    const { reportTime, active } = await fetchWarnings();
    host.textContent = '';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('class', 'b-icon');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (active.length === 0) {
      path.setAttribute('d', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 13.6-3.4-3.4 1.4-1.4 2 2 4.6-4.6 1.4 1.4z');
      path.setAttribute('fill', 'var(--status-good)');
    } else {
      path.setAttribute('d', 'M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z');
      path.setAttribute('fill', LEVEL_COLORS[active[0]!.level]!);
    }
    icon.appendChild(path);
    host.appendChild(icon);

    const body = make('div');
    if (active.length === 0) {
      host.className = 'banner ok col-12';
      body.appendChild(make('span', undefined, t('warnings.none')));
      const meta = make('span', undefined, ` — ${t('warnings.source')}, ${fmtTime(reportTime, lang)}`);
      meta.style.color = 'var(--muted)';
      meta.style.fontSize = '12.5px';
      body.appendChild(meta);
    } else {
      host.className = 'banner severe col-12';
      const head = make('strong', undefined, `${t('warnings.title')} — ${t('warnings.for')}`);
      body.appendChild(head);
      const list = make('div', 'warn-list');
      for (const w of active) {
        list.appendChild(badge(warningLabel(w, lang), w.level));
      }
      body.appendChild(list);
      const meta = make('div', undefined, `${t('warnings.source')} · ${t('common.updated')} ${fmtDateTime(reportTime, lang)}`);
      meta.style.color = 'var(--muted)';
      meta.style.fontSize = '12px';
      meta.style.marginTop = '6px';
      body.appendChild(meta);
    }
    host.appendChild(body);
  } catch {
    host.textContent = '';
    host.appendChild(make('p', 'placeholder error', t('common.error')));
  }
}

async function initNow(
  lang: Lang,
  t: (k: UIKey) => string,
  forecastP: Promise<Forecast> | null,
): Promise<void> {
  const host = widget('now');
  if (!host) return;
  try {
    const now = await fetchAmedasNow();
    host.textContent = '';

    const heroWrap = make('div');
    heroWrap.style.display = 'flex';
    heroWrap.style.alignItems = 'center';
    heroWrap.style.gap = '18px';

    const hero = make('div', 'hero-figure');
    if (now.temp !== null) {
      hero.appendChild(document.createTextNode(fmtNum(now.temp, lang, 1)));
      hero.appendChild(make('span', 'unit', '°C'));
    } else {
      hero.textContent = '—';
    }
    heroWrap.appendChild(hero);
    const cond = make('div');
    cond.style.fontSize = '15px';
    cond.style.color = 'var(--ink-2)';
    heroWrap.appendChild(cond);
    host.appendChild(heroWrap);

    const stats = make('div', 'stat-row');
    const stat = (label: string, value: string, unit?: string) => {
      const s = make('div', 'stat');
      s.appendChild(make('div', 'label', label));
      const v = make('div', 'value', value);
      if (unit) v.appendChild(make('span', 'unit', unit));
      s.appendChild(v);
      stats.appendChild(s);
      return s;
    };
    if (now.humidity !== null) stat(t('now.humidity'), fmtNum(now.humidity, lang), '%');
    if (now.windSpeed !== null)
      stat(t('now.wind'), `${windDirLabel(now.windDirection, lang)} ${fmtNum(now.windSpeed, lang, 1)}`, ' m/s');
    stat(t('now.precip1h'), fmtNum(now.precipitation1h ?? 0, lang, 1), ' mm');
    if (now.sun1h !== null) stat(t('now.sun1h'), fmtNum(Math.round(now.sun1h * 60), lang), ' min');
    if (now.snow !== null && now.snow > 0) stat(t('now.snow'), fmtNum(now.snow, lang), ' cm');
    host.appendChild(stats);

    setUpdated('[data-now-updated]', now.time, lang, t);

    // condition icon/label arrives with the forecast
    if (!forecastP) return;
    try {
      const fc = await forecastP;
      const icon = make('div', undefined, wmoIcon(fc.current.weatherCode));
      icon.style.fontSize = '34px';
      icon.style.lineHeight = '1.1';
      cond.appendChild(icon);
      cond.appendChild(make('div', undefined, wmoLabel(fc.current.weatherCode, lang)));
    } catch {
      /* condition is decoration; ignore */
    }
  } catch {
    chartMessage(host, t('common.error'), true);
  }
}

async function initForecast(
  lang: Lang,
  t: (k: UIKey) => string,
  forecastP: Promise<Forecast> | null,
): Promise<void> {
  if (!forecastP) return;
  const hostTemp = widget('hourly-temp');
  const hostWeek = widget('week');
  const hostPrecip = widget('precip');
  const hostUv = widget('uv');
  try {
    const fc = await forecastP;
    const nowMs = Date.now();
    const next24 = fc.hourly.filter((h) => h.time.getTime() >= nowMs - 30 * 60 * 1000).slice(0, 24);

    if (hostTemp) {
      lineChart(
        hostTemp,
        next24.map((h) => ({ label: fmtTime(h.time, lang), value: h.temp })),
        {
          seriesName: t('now.temperature'),
          unit: '°C',
          height: 230,
          xEvery: 4,
          valueFmt: decimal(lang),
          tableLabel: t('common.viewTable'),
          tableHead: [t('common.time'), `${t('now.temperature')} (°C)`],
        },
      );
      setUpdated('[data-forecast-updated]', fc.current.time, lang, t);
    }

    if (hostPrecip) {
      barChart(
        hostPrecip,
        next24.map((h) => ({ label: fmtTime(h.time, lang), value: h.pop })),
        {
          seriesName: t('forecast.pop'),
          unit: '%',
          height: 200,
          yDomain: [0, 100],
          xEvery: 4,
          tableLabel: t('common.viewTable'),
          tableHead: [t('common.time'), `${t('forecast.pop')} (%)`],
        },
      );
    }

    if (hostWeek) {
      hostWeek.textContent = '';
      const strip = make('div', 'day-strip');
      fc.daily.forEach((d, i) => {
        const card = make('div', 'day-card');
        const name =
          i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : fmtWeekday(d.date, lang);
        card.appendChild(make('div', 'd-name', name));
        card.appendChild(make('div', 'd-date', fmtDateShort(d.date, lang)));
        const icon = make('div', 'd-icon', wmoIcon(d.weatherCode));
        icon.setAttribute('role', 'img');
        icon.setAttribute('aria-label', wmoLabel(d.weatherCode, lang));
        card.appendChild(icon);
        card.appendChild(make('div', 'd-cond', wmoLabel(d.weatherCode, lang)));
        const temps = make('div', 'd-temps');
        temps.appendChild(make('span', 'hi', `${fmtNum(d.tMax, lang)}°`));
        temps.appendChild(document.createTextNode(' / '));
        temps.appendChild(make('span', 'lo', `${fmtNum(d.tMin, lang)}°`));
        card.appendChild(temps);
        card.appendChild(make('div', 'd-pop', `${t('forecast.pop')} ${fmtNum(d.popMax, lang)}%`));
        strip.appendChild(card);
      });
      hostWeek.appendChild(strip);
    }

    if (hostUv) {
      hostUv.textContent = '';
      const today = fc.daily[0];
      if (today) {
        const uv = today.uvMax;
        const level = uvLevel(uv);
        const hero = make('div', 'hero-figure', fmtNum(uv, lang, 1));
        hero.style.fontSize = '44px';
        hostUv.appendChild(hero);
        hostUv.appendChild(badge(t(`forecast.uv.${level}` as UIKey), level));
        const meter = make('div', 'meter');
        const color = LEVEL_COLORS[level]!;
        // unfilled track = a light step of the fill's own color, not a foreign hue
        meter.style.background = `color-mix(in srgb, ${color} 18%, var(--surface))`;
        const fill = make('div', 'fill');
        fill.style.width = `${Math.min(100, (uv / 11) * 100)}%`;
        fill.style.background = color;
        meter.appendChild(fill);
        hostUv.appendChild(meter);
      }
    }
  } catch {
    for (const host of [hostTemp, hostWeek, hostPrecip, hostUv]) {
      if (host) chartMessage(host, t('common.error'), true);
    }
  }
}

async function initAir(lang: Lang, t: (k: UIKey) => string): Promise<void> {
  const host = widget('air');
  if (!host) return;
  try {
    const air = await fetchAirQuality();
    host.textContent = '';

    const stats = make('div', 'stat-row');
    const rows: [UIKey, number | null][] = [
      ['air.pm25', air.current.pm25],
      ['air.pm10', air.current.pm10],
      ['air.o3', air.current.o3],
      ['air.no2', air.current.no2],
    ];
    for (const [key, value] of rows) {
      const s = make('div', 'stat');
      s.appendChild(make('div', 'label', t(key)));
      const v = make('div', 'value', value === null ? '—' : fmtNum(value, lang));
      v.appendChild(make('span', 'unit', ' µg/m³'));
      s.appendChild(v);
      stats.appendChild(s);
    }
    host.appendChild(stats);

    if (air.current.pm25 !== null) {
      const level = pm25Level(air.current.pm25);
      const b = badge(`${t('air.pm25')}: ${t(`air.level.${level}` as UIKey)}`, level);
      b.style.marginTop = '12px';
      host.appendChild(b);
    }

    const sparkTitle = make('p', 'card-sub', t('air.sparkTitle'));
    sparkTitle.style.margin = '16px 0 4px';
    host.appendChild(sparkTitle);
    const spark = make('div');
    host.appendChild(spark);
    const hist = air.pm25History.filter((_, i) => i % 2 === 0); // every 2 h
    lineChart(
      spark,
      hist.map((h) => ({ label: fmtDateTime(h.time, lang), value: h.value })),
      {
        seriesName: 'PM2.5',
        unit: ' µg/m³',
        height: 150,
        xEvery: 6,
        valueFmt: decimal(lang),
        tableLabel: t('common.viewTable'),
        tableHead: [t('common.time'), 'PM2.5 (µg/m³)'],
      },
    );

    setUpdated('[data-air-updated]', air.current.time, lang, t);
  } catch {
    chartMessage(host, t('common.error'), true);
  }
}

interface AirStationHour {
  time: string;
  so2: number | null;
  no2: number | null;
  ox: number | null;
  spm: number | null;
  pm25: number | null;
}

async function initAirStation(lang: Lang, t: (k: UIKey) => string): Promise<void> {
  const host = widget('air-station');
  if (!host) return;
  try {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const res = await fetch(`${base}/data/air.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as { hours: AirStationHour[] };
    const hours = file.hours ?? [];
    const latest = [...hours].reverse().find((h) => h.pm25 !== null || h.ox !== null);
    host.textContent = '';
    if (!latest) {
      host.appendChild(make('p', 'placeholder', t('airStation.empty')));
      return;
    }

    const stats = make('div', 'stat-row');
    const stat = (label: string, value: string, unit: string) => {
      const s = make('div', 'stat');
      s.appendChild(make('div', 'label', label));
      const v = make('div', 'value', value);
      v.appendChild(make('span', 'unit', unit));
      s.appendChild(v);
      stats.appendChild(s);
    };
    if (latest.pm25 !== null) stat(t('air.pm25'), fmtNum(latest.pm25, lang), ' µg/m³');
    if (latest.ox !== null) stat(t('airStation.ox'), fmtNum(latest.ox, lang, 3), ' ppm');
    if (latest.no2 !== null) stat(t('air.no2'), fmtNum(latest.no2, lang, 3), ' ppm');
    if (latest.spm !== null) stat(t('airStation.spm'), fmtNum(latest.spm, lang, 3), ' mg/m³');
    host.appendChild(stats);

    if (latest.pm25 !== null) {
      const level = pm25Level(latest.pm25);
      const b = badge(`${t('air.pm25')}: ${t(`air.level.${level}` as UIKey)}`, level);
      b.style.marginTop = '12px';
      host.appendChild(b);
    }

    const withPm = hours.filter((h) => h.pm25 !== null);
    if (withPm.length > 3) {
      const sparkTitle = make('p', 'card-sub', t('airStation.sparkTitle'));
      sparkTitle.style.margin = '16px 0 4px';
      host.appendChild(sparkTitle);
      const spark = make('div');
      host.appendChild(spark);
      lineChart(
        spark,
        withPm.map((h) => ({ label: fmtDateTime(new Date(h.time), lang), value: h.pm25! })),
        {
          seriesName: 'PM2.5',
          unit: ' µg/m³',
          height: 150,
          xEvery: 12,
          valueFmt: decimal(lang),
          tableLabel: t('common.viewTable'),
          tableHead: [t('common.time'), 'PM2.5 (µg/m³)'],
        },
      );
    }

    setUpdated('[data-air-station-updated]', new Date(latest.time), lang, t);
  } catch {
    chartMessage(host, t('common.error'), true);
  }
}

async function initPollen(lang: Lang, t: (k: UIKey) => string): Promise<void> {
  const host = widget('pollen');
  if (!host) return;
  try {
    const hours = await fetchPollenToday();
    host.textContent = '';
    if (!hours.length) {
      host.appendChild(make('p', 'placeholder', t('pollen.offSeason')));
      return;
    }

    const latest = hours[hours.length - 1]!;
    const level = pollenLevel(latest.count);
    const b = badge(
      `${fmtNum(latest.count, lang)} ${t('pollen.unit')} · ${t(`pollen.level.${level}` as UIKey)}`,
      level,
    );
    b.style.marginBottom = '10px';
    host.appendChild(b);

    const chart = make('div');
    host.appendChild(chart);
    barChart(
      chart,
      hours.map((h) => ({ label: fmtTime(h.time, lang), value: h.count })),
      {
        seriesName: t('pollen.title'),
        height: 180,
        xEvery: 3,
        tableLabel: t('common.viewTable'),
        tableHead: [t('common.time'), `${t('pollen.title')} (${t('pollen.unit')})`],
      },
    );
  } catch {
    chartMessage(host, t('common.error'), true);
  }
}

async function initQuakes(lang: Lang, t: (k: UIKey) => string): Promise<void> {
  const host = widget('quakes');
  if (!host) return;
  try {
    const quakes = (await fetchQuakes(8)).slice(0, 6);
    host.textContent = '';
    if (!quakes.length) {
      host.appendChild(make('p', 'placeholder', t('quakes.none')));
      return;
    }
    const list = make('ul', 'item-list');
    for (const q of quakes) {
      const li = make('li');
      const tile = make('span', 'intensity', intensityLabel(q.maxScale, lang));
      tile.title = t('quakes.maxIntensity');
      li.appendChild(tile);
      const when = make('span', 'when', fmtDateTime(q.time, lang));
      li.appendChild(when);
      const what = make('div', 'what');
      const title = make('div', 'title', q.epicenterJa);
      if (q.matsumotoScale !== null) {
        const felt = badge(
          `${t('quakes.feltMatsumoto')}: ${intensityLabel(q.matsumotoScale, lang)}`,
          'elevated',
        );
        felt.style.marginLeft = '8px';
        felt.style.fontSize = '11.5px';
        felt.style.padding = '2px 9px';
        title.appendChild(felt);
      } else if (q.feltNagano) {
        const felt = badge(t('quakes.feltNagano'), 'moderate');
        felt.style.marginLeft = '8px';
        felt.style.fontSize = '11.5px';
        felt.style.padding = '2px 9px';
        title.appendChild(felt);
      }
      what.appendChild(title);
      const meta: string[] = [];
      if (q.magnitude !== null) meta.push(`M${fmtNum(q.magnitude, lang, 1)}`);
      if (q.depthKm !== null) meta.push(`${t('quakes.depth')} ${fmtNum(q.depthKm, lang)} km`);
      what.appendChild(make('div', 'meta', meta.join(' · ')));
      li.appendChild(what);
      list.appendChild(li);
    }
    host.appendChild(list);
    const note = make('p', 'card-note', t('quakes.intensityNote'));
    host.appendChild(note);
  } catch {
    chartMessage(host, t('common.error'), true);
  }
}

/* ---- entry -------------------------------------------------------------- */

export function initDashboard(): void {
  const lang = getLang();
  const t = (key: UIKey): string => ui[lang][key] ?? ui.en[key];

  // Widgets absent from the page (feature toggles, see src/features.ts) are
  // skipped entirely — including their API calls.
  const needsForecast = ['now', 'hourly-temp', 'week', 'precip', 'uv'].some((n) => widget(n));
  const forecastP = needsForecast ? fetchForecast() : null;
  void initWarnings(lang, t);
  void initNow(lang, t, forecastP);
  void initForecast(lang, t, forecastP);
  void initAir(lang, t);
  void initAirStation(lang, t);
  void initPollen(lang, t);
  void initQuakes(lang, t);
}
