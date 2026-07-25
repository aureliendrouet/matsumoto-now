/** Shelters page: designated emergency evacuation sites (GSI open data, with
 *  per-hazard suitability flags) + AED locations (Matsumoto City open data),
 *  pre-processed by scripts/fetch-shelter-data.mjs into /data/shelters.json. */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ui, getLang, type Lang, type UIKey } from '../i18n/ui';

const MATSUMOTO: [number, number] = [36.238, 137.972];
const AED_MIN_ZOOM = 14;
const HAZARDS = ['flood', 'landslide', 'earthquake', 'fire', 'volcano'] as const;
type Hazard = (typeof HAZARDS)[number];

interface Shelter {
  name: string;
  address: string;
  lat: number;
  lon: number;
  hazards: Hazard[];
}

interface Aed {
  name: string;
  place: string | null;
  hours: string;
  lat: number;
  lon: number;
}

interface ShelterFile {
  fetched: string;
  shelters: Shelter[];
  aeds: Aed[];
}

function make(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shelterPopup(s: Shelter, t: (k: UIKey) => string): HTMLElement {
  const box = make('div');
  box.appendChild(make('strong', undefined, s.name));
  box.appendChild(make('div', undefined, s.address));
  if (s.hazards.length) {
    const covered = s.hazards.map((h) => t(`shelter.hazard.${h}` as UIKey)).join(' · ');
    const line = make('div', undefined, `${t('shelter.hazardsCovered')}: ${covered}`);
    line.style.marginTop = '4px';
    box.appendChild(line);
  }
  return box;
}

export function initShelterPage(): void {
  const lang = getLang();
  const t = (key: UIKey): string => ui[lang][key] ?? ui.en[key];
  const mapHost = document.getElementById('shelter-map');
  const filterHost = document.querySelector<HTMLElement>('[data-widget="hazard-filter"]');
  if (!mapHost) return;

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  fetch(`${base}/data/shelters.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? (res.json() as Promise<ShelterFile>) : Promise.reject(res.status)))
    .then((file) => {
      const map = L.map(mapHost, { scrollWheelZoom: false }).setView(MATSUMOTO, 12);
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
        attribution:
          '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院 (GSI)</a> · 松本市 (CC BY 4.0)',
        maxZoom: 18,
      }).addTo(map);

      // evacuation sites, refiltered in place when a hazard chip is pressed
      const shelterGroup = L.layerGroup().addTo(map);
      const renderShelters = (hazard: Hazard | null): void => {
        shelterGroup.clearLayers();
        for (const s of file.shelters) {
          if (hazard && !s.hazards.includes(hazard)) continue;
          const marker = L.circleMarker([s.lat, s.lon], {
            radius: 6,
            color: '#2a78d6',
            weight: 2,
            fillColor: '#2a78d6',
            fillOpacity: 0.35,
          });
          marker.bindTooltip(s.name);
          marker.bindPopup(shelterPopup(s, t));
          shelterGroup.addLayer(marker);
        }
      };
      renderShelters(null);

      // AED overlay, shown when zoomed in
      const aedGroup = L.layerGroup();
      for (const a of file.aeds) {
        const marker = L.circleMarker([a.lat, a.lon], {
          radius: 4.5,
          color: '#d03b3b',
          weight: 1.5,
          fillColor: '#fff',
          fillOpacity: 1,
        });
        const label = [a.name, a.place, `${t('shelter.aedHours')}: ${a.hours}`]
          .filter(Boolean)
          .join(' · ');
        marker.bindTooltip(label);
        aedGroup.addLayer(marker);
      }
      let aedWanted = true;
      const syncAed = () => {
        const show = aedWanted && map.getZoom() >= AED_MIN_ZOOM;
        if (show && !map.hasLayer(aedGroup)) aedGroup.addTo(map);
        if (!show && map.hasLayer(aedGroup)) map.removeLayer(aedGroup);
      };
      map.on('zoomend', syncAed);
      map.on('overlayadd', (e) => {
        if (e.layer === aedGroup) aedWanted = true;
      });
      map.on('overlayremove', (e) => {
        if (e.layer === aedGroup) aedWanted = false;
      });

      L.control
        .layers(undefined, { [`${t('shelter.aed')}`]: aedGroup }, { collapsed: false })
        .addTo(map);
      syncAed();

      // hazard filter chips
      if (filterHost) {
        const buttons: HTMLButtonElement[] = [];
        const addButton = (label: string, hazard: Hazard | null): void => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'filter-btn';
          btn.textContent =
            hazard === null
              ? `${label} (${file.shelters.length})`
              : `${label} (${file.shelters.filter((s) => s.hazards.includes(hazard)).length})`;
          btn.setAttribute('aria-pressed', hazard === null ? 'true' : 'false');
          btn.addEventListener('click', () => {
            for (const b of buttons) b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            renderShelters(hazard);
          });
          buttons.push(btn);
          filterHost.appendChild(btn);
        };
        addButton(t('shelter.all'), null);
        for (const h of HAZARDS) addButton(t(`shelter.hazard.${h}` as UIKey), h);
      }
    })
    .catch(() => {
      mapHost.textContent = '';
      mapHost.appendChild(make('p', 'placeholder error', t('common.error')));
    });
}
