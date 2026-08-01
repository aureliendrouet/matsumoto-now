/** Live temperature at every AMeDAS station inside Matsumoto's city limits.
 *
 *  Matsumoto is not one climate. The city runs from the 610 m basin floor to
 *  Kamikochi at 1,510 m, and on a summer night Nagawa is 7 °C colder than the
 *  centre while both reach the same temperature by midday. A single "Matsumoto"
 *  reading is therefore wrong for a good part of the city, and this map says so
 *  by showing all four stations at once.
 *
 *  Loaded through a dynamic import so Leaflet's ~150 kB stays off the landing
 *  page, which shares dashboard.ts but has no map. */

import type { Lang, UIKey } from '../i18n/ui';
import { fmtNum, fmtTime } from './format';
import { fetchStation, windDirLabel, type AmedasNow } from './jma';

/** The four JMA AMeDAS points inside the city boundary (穂高 and 鹿教湯 look
 *  close on a map but belong to Azumino and Ueda). Altitudes are JMA's own. */
export const CITY_STATIONS = [
  { id: '48361', key: 'station.matsumoto', lat: 36.2467, lon: 137.97, alt: 610 },
  { id: '48363', key: 'station.imai', lat: 36.1667, lon: 137.9217, alt: 658 },
  { id: '48466', key: 'station.nagawa', lat: 36.0883, lon: 137.6833, alt: 1068 },
  { id: '48346', key: 'station.kamikochi', lat: 36.2483, lon: 137.6333, alt: 1510 },
] as const;

export async function renderStationMap(
  host: HTMLElement,
  lang: Lang,
  t: (k: UIKey) => string,
): Promise<Date | null> {
  const [{ default: L }] = await Promise.all([
    import('leaflet'),
    import('leaflet/dist/leaflet.css'),
  ]);
  const { addLocateControl } = await import('./geolocate');
  const { addExpandControl } = await import('./map-expand');

  const readings = await Promise.all(
    CITY_STATIONS.map(async (s) => {
      try {
        return { station: s, now: await fetchStation(s.id) };
      } catch {
        return { station: s, now: null as AmedasNow | null };
      }
    }),
  );

  host.textContent = '';
  const frame = document.createElement('div');
  frame.className = 'map-frame station-map';
  host.appendChild(frame);

  const map = L.map(frame, { scrollWheelZoom: false });
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '国土地理院',
    maxZoom: 18,
  }).addTo(map);

  const temps = readings
    .map((r) => r.now?.temp)
    .filter((v): v is number => typeof v === 'number');
  const min = Math.min(...temps);
  const max = Math.max(...temps);

  for (const { station, now } of readings) {
    const name = t(station.key as UIKey);
    const temp = now?.temp ?? null;

    // The label *is* the marker: a bare pin would make the reader look twice to
    // pair a number with a place, and the number is the entire point here.
    const label = document.createElement('div');
    label.className = 'station-pin';
    if (temp === null) label.classList.add('no-temp');
    // warmest station tinted, coldest plain — a two-colour hint, not a scale,
    // because with four points a full ramp would imply precision we don't have
    if (temp !== null && temps.length > 1 && max - min >= 1) {
      if (temp === max) label.classList.add('warmest');
      if (temp === min) label.classList.add('coldest');
    }
    label.innerHTML = '';
    const value = document.createElement('span');
    value.className = 'v';
    value.textContent = temp === null ? '—' : `${fmtNum(temp, lang, 1)}°`;
    const place = document.createElement('span');
    place.className = 'n';
    place.textContent = name;
    label.append(value, place);

    const marker = L.marker([station.lat, station.lon], {
      icon: L.divIcon({ html: label.outerHTML, className: 'station-icon', iconSize: [0, 0] }),
      keyboard: true,
      alt: name,
    }).addTo(map);

    const rows: string[] = [`<strong>${name}</strong>`, `${station.alt} m`];
    if (temp !== null) rows.push(`${t('now.temperature')}: ${fmtNum(temp, lang, 1)} °C`);
    if (now?.humidity != null) rows.push(`${t('now.humidity')}: ${fmtNum(now.humidity, lang)} %`);
    if (now?.windSpeed != null) {
      rows.push(
        `${t('now.wind')}: ${windDirLabel(now.windDirection, lang)} ${fmtNum(now.windSpeed, lang, 1)} m/s`,
      );
    }
    if (now?.precipitation1h != null) {
      rows.push(`${t('now.precip1h')}: ${fmtNum(now.precipitation1h, lang, 1)} mm`);
    }
    if (temp === null) rows.push(`<em>${t('stations.noThermometer')}</em>`);
    marker.bindPopup(rows.join('<br>'));
  }

  map.fitBounds(
    CITY_STATIONS.map((s) => [s.lat, s.lon] as [number, number]),
    { padding: [46, 46] },
  );
  addLocateControl(map, t);
  addExpandControl(map, t);

  return readings.find((r) => r.now)?.now?.time ?? null;
}
