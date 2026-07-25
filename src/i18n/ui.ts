/** i18n core: assembles the per-language locale modules in ./locales/.
 *
 *  Each locale module exports the same four pieces (same key sets everywhere,
 *  enforced by scripts/check-locales.mjs):
 *    dict     — every UI string
 *    wmo      — WMO weather-code labels (Open-Meteo)
 *    warnings — JMA warning/advisory labels by bosai code
 *    dirs     — compass directions (0 = calm, 1–16 = NNE…N)
 *
 *  English is the reference locale: it defines `UIKey`, and all lookups fall
 *  back to it.
 */

import * as en from './locales/en';
import * as ja from './locales/ja';
import * as fr from './locales/fr';
import * as es from './locales/es';
import * as pt from './locales/pt';
import * as it from './locales/it';
import * as de from './locales/de';
import * as no from './locales/no';
import * as zh from './locales/zh';
import * as ko from './locales/ko';
import * as tl from './locales/tl';
import * as vi from './locales/vi';
import * as th from './locales/th';

// Ordered alphabetically by the language's English name
// (Chinese, English, Filipino, French, German, …) — this drives the dropdown.
export const languages = {
  zh: '中文',
  en: 'English',
  tl: 'Filipino',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  no: 'Norsk',
  pt: 'Português',
  es: 'Español',
  th: 'ไทย',
  vi: 'Tiếng Việt',
} as const;

export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';
export type UIKey = keyof typeof en.dict;

interface LocaleData {
  dict: Record<UIKey, string>;
  wmo: Record<number, string>;
  warnings: Record<string, string>;
  dirs: string[];
}

export const locales: Record<Lang, LocaleData> = { en, ja, fr, es, pt, it, de, no, zh, ko, tl, vi, th };

export const ui = Object.fromEntries(
  (Object.keys(locales) as Lang[]).map((l) => [l, locales[l].dict]),
) as Record<Lang, Record<UIKey, string>>;

/** Current page language from <html lang>, for client-side scripts. */
export function getLang(): Lang {
  const l = typeof document === 'undefined' ? 'en' : document.documentElement.lang;
  return (l in languages ? l : 'en') as Lang;
}
