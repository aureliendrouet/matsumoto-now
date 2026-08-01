/** Buses page: city bus routes & stops (GTFS open data, pre-processed by
 *  scripts/fetch-bus-data.mjs into /data/bus.json) on GSI tiles. */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ui, getLang, type Lang, type UIKey } from '../i18n/ui';
import { chartMessage } from './chart';
import { addLocateControl } from './geolocate';
import { addExpandControl } from './map-expand';

const MATSUMOTO: [number, number] = [36.238, 137.972];
const STOP_MIN_ZOOM = 14;

interface BusRoute {
  name: string;
  color: string | null;
  feed: 'station' | 'regional';
  /** the city's own timetable / fare PDF for this line (Japanese), when the
   *  monthly scrape matched it; null falls back to the city page as a whole */
  timetable: string | null;
  fare: string | null;
  paths: [number, number][][];
}

interface BusStop {
  name: string;
  nameEn: string | null;
  lat: number;
  lon: number;
}

interface BusFile {
  fetched: string;
  attribution: string;
  routes: BusRoute[];
  stops: BusStop[];
}

function make(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stopLabel(stop: BusStop, lang: Lang): string {
  if (lang === 'ja' || !stop.nameEn) return stop.name;
  return `${stop.nameEn}（${stop.name}）`;
}

/* ---- next departures (bus-times.json sidecar, loaded on first stop click) --- */

interface BusService {
  days: boolean[]; // [sun..sat]
  start: string; // YYYYMMDD
  end: string;
  add: string[]; // extra service dates (holidays etc.)
  del: string[]; // removed dates
}

interface BusTimes {
  routes: string[];
  services: BusService[];
  stops: [number, number, number[]][][]; // per stop: [routeIdx, serviceIdx, minutes[]]
}

let timesPromise: Promise<BusTimes | null> | null = null;
function loadTimes(): Promise<BusTimes | null> {
  if (!timesPromise) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    timesPromise = fetch(`${base}/data/bus-times.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<BusTimes>) : null))
      .catch(() => null);
  }
  return timesPromise;
}

function jstNow(): { date: string; day: number; minutes: number } {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    day: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function serviceRunsToday(svc: BusService, now: { date: string; day: number }): boolean {
  if (svc.del.includes(now.date)) return false;
  if (svc.add.includes(now.date)) return true;
  return svc.days[now.day] === true && svc.start <= now.date && now.date <= svc.end;
}

function nextDepartures(
  times: BusTimes,
  stopIdx: number,
  max = 6,
): { min: number; route: string }[] {
  const now = jstNow();
  const out: { min: number; route: string }[] = [];
  for (const [r, s, minutes] of times.stops[stopIdx] ?? []) {
    const svc = times.services[s];
    if (!svc || !serviceRunsToday(svc, now)) continue;
    for (const min of minutes) {
      if (min >= now.minutes && min < 1440) out.push({ min, route: times.routes[r] ?? '' });
    }
  }
  return out.sort((a, b) => a.min - b.min).slice(0, max);
}

function departuresContent(
  stop: BusStop,
  stopIdx: number,
  lang: Lang,
  t: (k: UIKey) => string,
): HTMLElement {
  const box = make('div');
  box.appendChild(make('strong', undefined, stopLabel(stop, lang)));
  const body = make('div', undefined, '…');
  body.style.marginTop = '4px';
  box.appendChild(body);
  void loadTimes().then((times) => {
    body.textContent = '';
    if (!times) {
      body.textContent = t('common.error');
      return;
    }
    const next = nextDepartures(times, stopIdx);
    if (!next.length) {
      body.textContent = t('bus.noMoreToday');
      return;
    }
    body.appendChild(make('div', undefined, t('bus.nextDepartures')));
    for (const d of next) {
      const row = make('div');
      const time = make(
        'strong',
        undefined,
        `${Math.floor(d.min / 60)}:${String(d.min % 60).padStart(2, '0')}`,
      );
      row.appendChild(time);
      row.appendChild(document.createTextNode(` ${d.route}`));
      body.appendChild(row);
    }
  });
  return box;
}

/** Stop indices served by a line, from the departures sidecar (bus.json has no
 *  stop↔route link). Empty when the sidecar is missing — the caller then leaves
 *  the zoom-based stop layer alone rather than showing a wrong subset. */
async function stopsOnRoute(routeName: string): Promise<number[]> {
  const times = await loadTimes();
  if (!times) return [];
  const routeIdx = times.routes.indexOf(routeName);
  if (routeIdx < 0) return [];
  const out: number[] = [];
  times.stops.forEach((entries, stopIdx) => {
    if (entries.some(([r]) => r === routeIdx)) out.push(stopIdx);
  });
  return out;
}

/** What the route list drives on the map. */
export interface MapControl {
  select(routeName: string | null): void;
}

function renderMap(file: BusFile, lang: Lang, t: (k: UIKey) => string): MapControl | null {
  const mapHost = document.getElementById('bus-map');
  if (!mapHost) return null;

  const map = L.map(mapHost, { scrollWheelZoom: false }).setView(MATSUMOTO, 12);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution:
      '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院 (GSI)</a> · 松本市 (CC BY 4.0) · <a href="https://gtfs-data.jp" target="_blank" rel="noopener">gtfs-data.jp</a>',
    maxZoom: 18,
  }).addTo(map);

  const groups: Record<BusRoute['feed'], L.LayerGroup> = {
    station: L.layerGroup().addTo(map),
    regional: L.layerGroup().addTo(map),
  };

  let selected: string | null = null;
  const linesByRoute = new Map<string, L.Polyline[]>();
  for (const route of file.routes) {
    const color = route.color ?? 'var(--series-1)';
    const lines: L.Polyline[] = [];
    for (const path of route.paths) {
      const line = L.polyline(path as L.LatLngExpression[], {
        color,
        weight: 3,
        opacity: 0.8,
      });
      line.bindTooltip(route.name, { sticky: true });
      // hover emphasis is suppressed while a line is selected, so the dimmed
      // lines stay dimmed and the selection reads unambiguously
      line.on('mouseover', () => !selected && line.setStyle({ weight: 5, opacity: 1 }));
      line.on('mouseout', () => !selected && line.setStyle({ weight: 3, opacity: 0.8 }));
      groups[route.feed].addLayer(line);
      lines.push(line);
    }
    linesByRoute.set(route.name, lines);
  }

  const stopMarker = (stopIdx: number): L.CircleMarker => {
    const stop = file.stops[stopIdx];
    const marker = L.circleMarker([stop.lat, stop.lon], {
      radius: 4.5,
      color: 'var(--ink, #333)',
      weight: 1.5,
      fillColor: '#fff',
      fillOpacity: 1,
    });
    marker.bindTooltip(stopLabel(stop, lang));
    // content is built at open time so "next departures" reflect the clock
    marker.bindPopup(() => departuresContent(stop, stopIdx, lang, t));
    return marker;
  };

  const stopsGroup = L.layerGroup();
  file.stops.forEach((_, stopIdx) => stopsGroup.addLayer(stopMarker(stopIdx)));

  // stops of the selected line only, shown at every zoom level
  const routeStops = L.layerGroup();

  const syncStops = () => {
    // while a line is selected its own stops replace the zoom-based layer
    const wantAll = !selected && map.getZoom() >= STOP_MIN_ZOOM;
    if (wantAll && !map.hasLayer(stopsGroup)) stopsGroup.addTo(map);
    if (!wantAll && map.hasLayer(stopsGroup)) map.removeLayer(stopsGroup);
  };
  map.on('zoomend', syncStops);
  syncStops();

  /** Guards against a slow stop lookup landing after the user picked another
   *  line: only the newest selection may draw. */
  let selectionToken = 0;

  const select = (routeName: string | null): void => {
    selected = routeName;
    const token = ++selectionToken;
    routeStops.clearLayers();
    if (map.hasLayer(routeStops)) map.removeLayer(routeStops);

    for (const [name, lines] of linesByRoute) {
      const on = routeName === null || name === routeName;
      for (const line of lines) {
        line.setStyle(
          routeName === null
            ? { weight: 3, opacity: 0.8 }
            : on
              ? { weight: 5, opacity: 1 }
              : { weight: 2, opacity: 0.15 },
        );
        if (on && routeName !== null) line.bringToFront();
      }
    }
    syncStops();
    if (routeName === null) return;

    const lines = linesByRoute.get(routeName) ?? [];
    const bounds = lines.reduce<L.LatLngBounds | null>(
      (acc, line) => (acc ? acc.extend(line.getBounds()) : line.getBounds()),
      null,
    );
    if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
    // the chips sit below the map: on a phone the highlight would otherwise
    // happen off-screen
    mapHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    void stopsOnRoute(routeName).then((indices) => {
      if (token !== selectionToken) return;
      for (const stopIdx of indices) routeStops.addLayer(stopMarker(stopIdx));
      if (indices.length) routeStops.addTo(map);
    });
  };

  L.control
    .layers(
      undefined,
      {
        [t('bus.layerStation')]: groups.station,
        [t('bus.layerRegional')]: groups.regional,
      },
      { collapsed: false },
    )
    .addTo(map);

  addLocateControl(map, t);
  addExpandControl(map, t);
  return { select };
}

const CITY_BUS_URL = 'https://www.city.matsumoto.nagano.jp/soshiki/222/3237.html';
const BUS_LOCATION_URL = 'https://www.city.matsumoto.nagano.jp/soshiki/224/121490.html';

function externalLink(href: string, label: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = `${label} ↗`;
  return a;
}

function renderRouteList(file: BusFile, t: (k: UIKey) => string, map: MapControl | null): void {
  const host = document.querySelector<HTMLElement>('[data-widget="bus-routes"]');
  if (!host) return;
  host.textContent = '';
  host.appendChild(make('p', 'card-sub', t('bus.chipNote')));

  // details of the selected line: its own timetable and fare PDFs
  const detail = make('div', 'line-detail');
  detail.hidden = true;
  host.appendChild(detail);

  const chips = new Map<string, HTMLButtonElement>();
  let current: string | null = null;

  const select = (route: BusRoute | null): void => {
    current = route ? route.name : null;
    for (const [name, chip] of chips) chip.setAttribute('aria-pressed', String(name === current));
    map?.select(current);

    detail.textContent = '';
    detail.hidden = route === null;
    if (!route) return;

    detail.appendChild(make('strong', undefined, route.name));
    const links = make('p', 'card-note');
    // the city publishes these per line as Japanese-language PDFs; without a
    // match (a new line, or a reworded heading) we can only offer the index page
    links.appendChild(
      externalLink(route.timetable ?? CITY_BUS_URL, t(route.timetable ? 'bus.lineTimetable' : 'bus.timetables')),
    );
    if (route.fare) {
      links.appendChild(document.createTextNode(' · '));
      links.appendChild(externalLink(route.fare, t('bus.lineFares')));
    }
    detail.appendChild(links);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'link-button';
    clear.textContent = t('bus.clearSelection');
    clear.addEventListener('click', () => select(null));
    detail.appendChild(clear);
  };

  for (const feed of ['station', 'regional'] as const) {
    const routes = file.routes.filter((r) => r.feed === feed);
    if (!routes.length) continue;
    const sub = make('p', 'card-sub', t(feed === 'station' ? 'bus.layerStation' : 'bus.layerRegional'));
    sub.style.margin = '14px 0 6px';
    host.appendChild(sub);
    const list = make('div', 'chip-row');
    for (const route of routes) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'badge';
      chip.setAttribute('aria-pressed', 'false');
      chip.textContent = route.name;
      const dot = make('span', 'dot');
      dot.style.background = route.color ?? 'var(--series-1)';
      chip.prepend(dot);
      // clicking the active chip clears the selection
      chip.addEventListener('click', () => select(current === route.name ? null : route));
      chips.set(route.name, chip);
      list.appendChild(chip);
    }
    host.appendChild(list);
  }

  const links = make('p', 'card-note');
  links.appendChild(externalLink(CITY_BUS_URL, t('bus.timetables')));
  links.appendChild(document.createTextNode(' · '));
  links.appendChild(externalLink(BUS_LOCATION_URL, t('bus.location')));
  host.appendChild(links);
}

export function initBusPage(): void {
  const lang = getLang();
  const t = (key: UIKey): string => ui[lang][key] ?? ui.en[key];
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  fetch(`${base}/data/bus.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? (res.json() as Promise<BusFile>) : Promise.reject(res.status)))
    .then((file) => {
      const map = renderMap(file, lang, t);
      renderRouteList(file, t, map);
    })
    .catch(() => {
      const host = document.querySelector<HTMLElement>('[data-widget="bus-routes"]');
      if (host) chartMessage(host, t('common.error'), true);
      const mapHost = document.getElementById('bus-map');
      if (mapHost) {
        mapHost.textContent = '';
        mapHost.appendChild(make('p', 'placeholder error', t('common.error')));
      }
    });
}
