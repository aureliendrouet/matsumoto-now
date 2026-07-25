import type { Lang } from '../i18n/ui';

const JST = 'Asia/Tokyo';

export function locale(lang: Lang): string {
  return lang === 'ja' ? 'ja-JP' : lang === 'fr' ? 'fr-FR' : 'en-GB';
}

export function fmtTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: JST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function fmtDateTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: JST,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function fmtDateShort(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: JST,
    month: 'numeric',
    day: 'numeric',
  }).format(d);
}

export function fmtWeekday(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: JST, weekday: 'short' }).format(d);
}

export function fmtNum(n: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Date parts in JST for a given instant. */
export function jstParts(d: Date): { y: number; m: number; d: number; h: number } {
  const shifted = new Date(d.getTime() + 9 * 3600 * 1000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
  };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
