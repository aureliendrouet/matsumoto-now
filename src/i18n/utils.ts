import { ui, languages, defaultLang, type Lang, type UIKey } from './ui';

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}

/** Prefix a site-internal path with the configured base path. */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** Link to a page in a given language. `path` is language-relative, e.g. "earthquakes". */
export function localePath(lang: Lang, path = ''): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  return withBase(`/${lang}/${clean ? `${clean}/` : ''}`);
}

export const langParams = (Object.keys(languages) as Lang[]).map((lang) => ({
  params: { lang },
}));

export function asLang(value: string | undefined): Lang {
  return (value && value in languages ? value : defaultLang) as Lang;
}
