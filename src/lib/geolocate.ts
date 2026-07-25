/** "Show my location" Leaflet control — browser Geolocation API (GPS on
 *  mobile, Wi-Fi/IP on desktop; needs HTTPS, which GitHub Pages provides). */

import L from 'leaflet';
import type { UIKey } from '../i18n/ui';

export function addLocateControl(
  map: L.Map,
  t: (k: UIKey) => string,
  onLocate?: (latlng: L.LatLng) => void,
): void {
  const Locate = L.Control.extend({
    options: { position: 'topleft' },
    onAdd(): HTMLElement {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const btn = L.DomUtil.create('a', 'locate-btn', div);
      btn.href = '#';
      btn.title = t('map.locate');
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', t('map.locate'));
      btn.textContent = '⌖';

      let marker: L.CircleMarker | null = null;
      let accuracy: L.Circle | null = null;

      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        if (!('geolocation' in navigator)) {
          alert(t('map.locateError'));
          return;
        }
        btn.textContent = '…';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btn.textContent = '⌖';
            const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
            marker?.remove();
            accuracy?.remove();
            accuracy = L.circle(ll, {
              radius: pos.coords.accuracy,
              color: '#2a78d6',
              weight: 1,
              fillColor: '#2a78d6',
              fillOpacity: 0.08,
            }).addTo(map);
            marker = L.circleMarker(ll, {
              radius: 7,
              color: '#fff',
              weight: 2,
              fillColor: '#2a78d6',
              fillOpacity: 1,
            }).addTo(map);
            marker.bindTooltip(t('map.locate'));
            map.setView(ll, Math.max(map.getZoom(), 15));
            onLocate?.(ll);
          },
          () => {
            btn.textContent = '⌖';
            alert(t('map.locateError'));
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      });
      return div;
    },
  });
  map.addControl(new Locate());
}
