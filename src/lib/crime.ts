/** Crime statistics card: Nagano Prefectural Police open data, pre-aggregated for
 *  Matsumoto by scripts/fetch-crime-data.mjs into /data/crime.json (updated yearly). */

import type { Lang, UIKey } from '../i18n/ui';
import { fmtNum } from './format';
import { barChart, chartMessage } from './chart';

interface CrimeCategory {
  key: string;
  count: number;
  prev: number | null;
}

interface CrimeFile {
  fetched: string;
  year: number;
  prevYear: number;
  categories: CrimeCategory[];
  topAreas: { name: string; count: number }[];
  byHour: number[];
}

function make(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function hourLabel(h: number, lang: Lang): string {
  return lang === 'ja' ? `${h}時` : `${h}:00`;
}

function renderStats(host: HTMLElement, file: CrimeFile, lang: Lang, t: (k: UIKey) => string): void {
  host.textContent = '';
  const stats = make('div', 'stat-row');
  for (const c of file.categories) {
    const s = make('div', 'stat');
    s.appendChild(make('div', 'label', t(`crime.cat.${c.key}` as UIKey)));
    s.appendChild(make('div', 'value', fmtNum(c.count, lang)));
    if (c.prev !== null) {
      const delta = make('div', 'label', `${file.prevYear}: ${fmtNum(c.prev, lang)}`);
      s.appendChild(delta);
    }
    stats.appendChild(s);
  }
  host.appendChild(stats);
}

function renderDetail(host: HTMLElement, file: CrimeFile, lang: Lang, t: (k: UIKey) => string): void {
  host.textContent = '';

  if (file.topAreas.length) {
    const list = make('ul', 'rank-list');
    const max = file.topAreas[0]!.count;
    for (const area of file.topAreas) {
      const li = make('li');
      li.appendChild(make('span', 'name', area.name));
      const track = make('span', 'track');
      const bar = make('span', 'bar');
      bar.style.width = `${Math.max(2, (area.count / max) * 100)}%`;
      track.appendChild(bar);
      li.appendChild(track);
      li.appendChild(make('span', 'count', fmtNum(area.count, lang)));
      list.appendChild(li);
    }
    host.appendChild(list);
  }

  const total = file.byHour.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const sub = make('p', 'card-sub', `${t('crime.byHour')} (${file.year})`);
    sub.style.margin = '18px 0 4px';
    host.appendChild(sub);
    const chart = make('div');
    host.appendChild(chart);
    barChart(
      chart,
      file.byHour.map((count, h) => ({ label: hourLabel(h, lang), value: count })),
      {
        seriesName: t('crime.cat.bicycleTheft'),
        height: 160,
        xEvery: 4,
        tableLabel: t('common.viewTable'),
        tableHead: [t('common.time'), t('crime.cat.bicycleTheft')],
      },
    );
  }
}

export function initCrime(lang: Lang, t: (k: UIKey) => string): void {
  const statsHost = document.querySelector<HTMLElement>('[data-widget="crime"]');
  const detailHost = document.querySelector<HTMLElement>('[data-widget="crime-detail"]');
  if (!statsHost && !detailHost) return;

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  fetch(`${base}/data/crime.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? (res.json() as Promise<CrimeFile>) : Promise.reject(res.status)))
    .then((file) => {
      for (const node of document.querySelectorAll<HTMLElement>('[data-crime-year]')) {
        node.textContent = String(file.year);
      }
      if (statsHost) renderStats(statsHost, file, lang, t);
      if (detailHost) renderDetail(detailHost, file, lang, t);
    })
    .catch(() => {
      for (const host of [statsHost, detailHost]) {
        if (!host) continue;
        host.textContent = '';
        host.appendChild(make('p', 'placeholder', t('crime.empty')));
      }
    });
}
