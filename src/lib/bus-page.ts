/** Buses page: city bus routes & stops (GTFS open data, pre-processed by
 *  scripts/fetch-bus-data.mjs into /data/bus.json) on GSI tiles. */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ui, getLang, type Lang, type UIKey } from '../i18n/ui';
import { chartMessage } from './chart';

const MATSUMOTO: [number, number] = [36.238, 137.972];
const STOP_MIN_ZOOM = 14;

interface BusRoute {
  name: string;
  color: string | null;
  feed: 'station' | 'regional';
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

function renderMap(file: BusFile, lang: Lang, t: (k: UIKey) => string): void {
  const mapHost = document.getElementById('bus-map');
  if (!mapHost) return;

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

  for (const route of file.routes) {
    const color = route.color ?? 'var(--series-1)';
    for (const path of route.paths) {
      const line = L.polyline(path as L.LatLngExpression[], {
        color,
        weight: 3,
        opacity: 0.8,
      });
      line.bindTooltip(route.name, { sticky: true });
      line.on('mouseover', () => line.setStyle({ weight: 5, opacity: 1 }));
      line.on('mouseout', () => line.setStyle({ weight: 3, opacity: 0.8 }));
      groups[route.feed].addLayer(line);
    }
  }

  const stopsGroup = L.layerGroup();
  for (const stop of file.stops) {
    const marker = L.circleMarker([stop.lat, stop.lon], {
      radius: 4.5,
      color: 'var(--ink, #333)',
      weight: 1.5,
      fillColor: '#fff',
      fillOpacity: 1,
    });
    marker.bindTooltip(stopLabel(stop, lang));
    stopsGroup.addLayer(marker);
  }

  const syncStops = () => {
    if (map.getZoom() >= STOP_MIN_ZOOM) {
      if (!map.hasLayer(stopsGroup)) stopsGroup.addTo(map);
    } else if (map.hasLayer(stopsGroup)) {
      map.removeLayer(stopsGroup);
    }
  };
  map.on('zoomend', syncStops);
  syncStops();

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
}

function renderRouteList(file: BusFile, t: (k: UIKey) => string): void {
  const host = document.querySelector<HTMLElement>('[data-widget="bus-routes"]');
  if (!host) return;
  host.textContent = '';
  for (const feed of ['station', 'regional'] as const) {
    const routes = file.routes.filter((r) => r.feed === feed);
    if (!routes.length) continue;
    const sub = make('p', 'card-sub', t(feed === 'station' ? 'bus.layerStation' : 'bus.layerRegional'));
    sub.style.margin = '14px 0 6px';
    host.appendChild(sub);
    const list = make('div', 'warn-list');
    for (const route of routes) {
      const chip = make('span', 'badge', route.name);
      const dot = make('span', 'dot');
      dot.style.background = route.color ?? 'var(--series-1)';
      chip.prepend(dot);
      list.appendChild(chip);
    }
    host.appendChild(list);
  }
}

export function initBusPage(): void {
  const lang = getLang();
  const t = (key: UIKey): string => ui[lang][key] ?? ui.en[key];
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  fetch(`${base}/data/bus.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? (res.json() as Promise<BusFile>) : Promise.reject(res.status)))
    .then((file) => {
      renderMap(file, lang, t);
      renderRouteList(file, t);
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
