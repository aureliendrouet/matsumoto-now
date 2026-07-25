import type { Lang } from '../i18n/ui';

/** WMO weather interpretation codes (Open-Meteo `weather_code`). */
const TABLE: Record<number, { icon: string; en: string; ja: string; fr: string }> = {
  0: { icon: '☀️', en: 'Clear', ja: '快晴', fr: 'Dégagé' },
  1: { icon: '🌤️', en: 'Mostly clear', ja: '晴れ', fr: 'Plutôt dégagé' },
  2: { icon: '⛅', en: 'Partly cloudy', ja: '晴れ時々くもり', fr: 'Partiellement nuageux' },
  3: { icon: '☁️', en: 'Overcast', ja: 'くもり', fr: 'Couvert' },
  45: { icon: '🌫️', en: 'Fog', ja: '霧', fr: 'Brouillard' },
  48: { icon: '🌫️', en: 'Rime fog', ja: '着氷性の霧', fr: 'Brouillard givrant' },
  51: { icon: '🌦️', en: 'Light drizzle', ja: '弱い霧雨', fr: 'Bruine légère' },
  53: { icon: '🌦️', en: 'Drizzle', ja: '霧雨', fr: 'Bruine' },
  55: { icon: '🌧️', en: 'Heavy drizzle', ja: '強い霧雨', fr: 'Bruine forte' },
  56: { icon: '🌧️', en: 'Freezing drizzle', ja: '着氷性の霧雨', fr: 'Bruine verglaçante' },
  57: { icon: '🌧️', en: 'Freezing drizzle', ja: '着氷性の霧雨', fr: 'Bruine verglaçante' },
  61: { icon: '🌦️', en: 'Light rain', ja: '弱い雨', fr: 'Pluie faible' },
  63: { icon: '🌧️', en: 'Rain', ja: '雨', fr: 'Pluie' },
  65: { icon: '🌧️', en: 'Heavy rain', ja: '強い雨', fr: 'Pluie forte' },
  66: { icon: '🌧️', en: 'Freezing rain', ja: '着氷性の雨', fr: 'Pluie verglaçante' },
  67: { icon: '🌧️', en: 'Freezing rain', ja: '着氷性の雨', fr: 'Pluie verglaçante' },
  71: { icon: '🌨️', en: 'Light snow', ja: '弱い雪', fr: 'Neige faible' },
  73: { icon: '🌨️', en: 'Snow', ja: '雪', fr: 'Neige' },
  75: { icon: '❄️', en: 'Heavy snow', ja: '大雪', fr: 'Neige forte' },
  77: { icon: '🌨️', en: 'Snow grains', ja: '霧雪', fr: 'Neige en grains' },
  80: { icon: '🌦️', en: 'Light showers', ja: '弱いにわか雨', fr: 'Averses faibles' },
  81: { icon: '🌧️', en: 'Showers', ja: 'にわか雨', fr: 'Averses' },
  82: { icon: '⛈️', en: 'Heavy showers', ja: '激しいにわか雨', fr: 'Averses fortes' },
  85: { icon: '🌨️', en: 'Snow showers', ja: 'にわか雪', fr: 'Averses de neige' },
  86: { icon: '❄️', en: 'Heavy snow showers', ja: '強いにわか雪', fr: 'Fortes averses de neige' },
  95: { icon: '⛈️', en: 'Thunderstorm', ja: '雷雨', fr: 'Orage' },
  96: { icon: '⛈️', en: 'Thunderstorm, hail', ja: '雷雨・ひょう', fr: 'Orage avec grêle' },
  99: { icon: '⛈️', en: 'Severe thunderstorm', ja: '激しい雷雨・ひょう', fr: 'Orage violent avec grêle' },
};

export function wmoIcon(code: number): string {
  return TABLE[code]?.icon ?? '☁️';
}

export function wmoLabel(code: number, lang: Lang): string {
  const row = TABLE[code];
  if (!row) return lang === 'ja' ? '不明' : lang === 'fr' ? 'Inconnu' : 'Unknown';
  return row[lang];
}
