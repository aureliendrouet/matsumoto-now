import type { Lang } from '../i18n/ui';

/** WMO weather interpretation codes (Open-Meteo `weather_code`). */
const TABLE: Record<number, { icon: string; en: string; ja: string }> = {
  0: { icon: '☀️', en: 'Clear', ja: '快晴' },
  1: { icon: '🌤️', en: 'Mostly clear', ja: '晴れ' },
  2: { icon: '⛅', en: 'Partly cloudy', ja: '晴れ時々くもり' },
  3: { icon: '☁️', en: 'Overcast', ja: 'くもり' },
  45: { icon: '🌫️', en: 'Fog', ja: '霧' },
  48: { icon: '🌫️', en: 'Rime fog', ja: '着氷性の霧' },
  51: { icon: '🌦️', en: 'Light drizzle', ja: '弱い霧雨' },
  53: { icon: '🌦️', en: 'Drizzle', ja: '霧雨' },
  55: { icon: '🌧️', en: 'Heavy drizzle', ja: '強い霧雨' },
  56: { icon: '🌧️', en: 'Freezing drizzle', ja: '着氷性の霧雨' },
  57: { icon: '🌧️', en: 'Freezing drizzle', ja: '着氷性の霧雨' },
  61: { icon: '🌦️', en: 'Light rain', ja: '弱い雨' },
  63: { icon: '🌧️', en: 'Rain', ja: '雨' },
  65: { icon: '🌧️', en: 'Heavy rain', ja: '強い雨' },
  66: { icon: '🌧️', en: 'Freezing rain', ja: '着氷性の雨' },
  67: { icon: '🌧️', en: 'Freezing rain', ja: '着氷性の雨' },
  71: { icon: '🌨️', en: 'Light snow', ja: '弱い雪' },
  73: { icon: '🌨️', en: 'Snow', ja: '雪' },
  75: { icon: '❄️', en: 'Heavy snow', ja: '大雪' },
  77: { icon: '🌨️', en: 'Snow grains', ja: '霧雪' },
  80: { icon: '🌦️', en: 'Light showers', ja: '弱いにわか雨' },
  81: { icon: '🌧️', en: 'Showers', ja: 'にわか雨' },
  82: { icon: '⛈️', en: 'Heavy showers', ja: '激しいにわか雨' },
  85: { icon: '🌨️', en: 'Snow showers', ja: 'にわか雪' },
  86: { icon: '❄️', en: 'Heavy snow showers', ja: '強いにわか雪' },
  95: { icon: '⛈️', en: 'Thunderstorm', ja: '雷雨' },
  96: { icon: '⛈️', en: 'Thunderstorm, hail', ja: '雷雨・ひょう' },
  99: { icon: '⛈️', en: 'Severe thunderstorm', ja: '激しい雷雨・ひょう' },
};

export function wmoIcon(code: number): string {
  return TABLE[code]?.icon ?? '☁️';
}

export function wmoLabel(code: number, lang: Lang): string {
  const row = TABLE[code];
  if (!row) return lang === 'ja' ? '不明' : 'Unknown';
  return lang === 'ja' ? row.ja : row.en;
}
