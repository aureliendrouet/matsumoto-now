import { locales, type Lang } from '../i18n/ui';

/** Icons for WMO weather interpretation codes (Open-Meteo `weather_code`).
 *  Labels live in the locale modules (src/i18n/locales/*). */
const ICONS: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  56: '🌧️',
  57: '🌧️',
  61: '🌦️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '❄️',
  77: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  85: '🌨️',
  86: '❄️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

export function wmoIcon(code: number): string {
  return ICONS[code] ?? '☁️';
}

export function wmoLabel(code: number, lang: Lang): string {
  return locales[lang].wmo[code] ?? locales.en.wmo[code] ?? '—';
}
