/** Fire page: live incidents, 119 dispatch counters and the wildfire advisory
 *  from 松本広域消防局, fetched by scripts/fetch-fire-data.mjs into
 *  /data/fire.json (30 min), plus yearly statistics from
 *  scripts/fetch-fire-stats.mjs in /data/fire-stats.json (monthly). */

import { ui, getLang, type Lang, type UIKey } from '../i18n/ui';
import { fmtNum, fmtDateTime, fmtTime } from './format';
import { barChart, chartMessage } from './chart';

interface Incident {
  start: string;
  city: string | null;
  area: string;
  end: string | null;
  outcome: 'extinguished' | 'notFire' | null;
}

interface CountSpan {
  today: number;
  yesterday: number;
  month: number;
  year: number;
}

interface Advisory {
  active: boolean;
  changed: string | null;
  link: string | null;
}

interface FireFile {
  fetched: string;
  sourceUpdated: string | null;
  city: string;
  active: { at: string; city: string | null; area: string }[] | null;
  recent: Incident[] | null;
  counts: ({ retrievedAt: string | null } & Record<string, CountSpan>) | null;
  advisories: Partial<Record<'wildfire' | 'fireWarning', Advisory>> | null;
}

interface StatsFile {
  years: number[];
  latestYear: number;
  series: Record<string, (number | null)[]>;
  causes: { key: string | null; raw: string; count: number }[];
  matsumoto: Record<string, number | null> | null;
  region: Record<string, number | null> | null;
}

type T = (key: UIKey) => string;

function make(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function widget(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-widget="${name}"]`);
}

function muted(text: string, size = '12.5px', tag = 'div'): HTMLElement {
  const el = make(tag, undefined, text);
  el.style.color = 'var(--muted)';
  el.style.fontSize = size;
  return el;
}

/** The banner icon used on the dashboard: check when clear, triangle when not. */
function bannerIcon(ok: boolean): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'b-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute(
    'd',
    ok
      ? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 13.6-3.4-3.4 1.4-1.4 2 2 4.6-4.6 1.4 1.4z'
      : 'M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-7h-2v5h2V9z',
  );
  path.setAttribute('fill', ok ? 'var(--status-good)' : 'var(--status-critical)');
  svg.appendChild(path);
  return svg;
}

/* ---- wildfire advisory / fire warning ----------------------------------- */

function renderAdvisory(host: HTMLElement, file: FireFile, lang: Lang, t: T): void {
  host.textContent = '';
  const wildfire = file.advisories?.wildfire;
  const fireWarning = file.advisories?.fireWarning;

  if (!wildfire && !fireWarning) {
    host.className = 'card col-12';
    host.appendChild(make('p', 'placeholder', t('fire.empty')));
    return;
  }

  const active = [
    fireWarning?.active ? { key: 'fire.warningOn' as UIKey, a: fireWarning } : null,
    wildfire?.active ? { key: 'fire.advisoryOn' as UIKey, a: wildfire } : null,
  ].filter((x): x is { key: UIKey; a: Advisory } => x !== null);

  host.className = `banner ${active.length ? 'severe' : 'ok'} col-12`;
  host.appendChild(bannerIcon(active.length === 0));

  const body = make('div');
  if (active.length === 0) {
    body.appendChild(make('span', undefined, t('fire.advisoryOff')));
    const since = wildfire?.changed;
    if (since) {
      body.appendChild(
        muted(` — ${t('fire.advisoryLifted')} ${fmtDateTime(new Date(since), lang)}`, '12.5px', 'span'),
      );
    }
  } else {
    for (const { key, a } of active) {
      body.appendChild(make('strong', undefined, t(key)));
      if (a.changed) {
        body.appendChild(muted(`${t('fire.advisorySince')} ${fmtDateTime(new Date(a.changed), lang)}`));
      }
    }
    // The full list of restrictions lives in the always-visible card below, so
    // the banner only points at it rather than repeating the sentence.
    const pointer = make('p', undefined, t('fire.rulesShort'));
    pointer.style.margin = '8px 0 0';
    body.appendChild(pointer);
    const link = wildfire?.active ? wildfire.link : fireWarning?.link;
    if (link) {
      const p = make('p');
      p.style.margin = '6px 0 0';
      p.style.fontSize = '13px';
      const a = make('a', undefined, `${t('fire.advisoryDetail')} ↗`) as HTMLAnchorElement;
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener';
      p.appendChild(a);
      body.appendChild(p);
    }
  }
  host.appendChild(body);
}

/* ---- live incidents ----------------------------------------------------- */

function renderActive(host: HTMLElement, file: FireFile, lang: Lang, t: T): void {
  host.textContent = '';
  if (file.active === null) {
    host.appendChild(make('p', 'placeholder', t('fire.empty')));
    return;
  }

  if (file.active.length === 0) {
    const p = make('p', 'card-sub', t('fire.activeNone'));
    p.style.margin = '0';
    host.appendChild(p);
  } else {
    const list = make('ul', 'contact-list');
    for (const inc of file.active) {
      const li = make('li');
      const what = make('div', 'what');
      what.appendChild(make('div', 'title', `${t('fire.activeNear')} ${inc.area}`));
      what.appendChild(
        make('div', 'meta', `${t('fire.reported')} ${fmtDateTime(new Date(inc.at), lang)}`),
      );
      li.appendChild(what);
      list.appendChild(li);
    }
    host.appendChild(list);
  }

  if (file.sourceUpdated) {
    host.appendChild(
      muted(`${t('common.updated')} ${fmtDateTime(new Date(file.sourceUpdated), lang)}`),
    ).style.marginTop = '10px';
  }
}

function renderRecent(host: HTMLElement, file: FireFile, lang: Lang, t: T): void {
  host.textContent = '';
  if (!file.recent?.length) {
    host.appendChild(make('p', 'placeholder', file.recent ? t('fire.recentNone') : t('fire.empty')));
    return;
  }

  const list = make('ul', 'contact-list');
  for (const inc of file.recent) {
    const li = make('li');
    const what = make('div', 'what');
    what.appendChild(make('div', 'title', inc.area));

    const start = new Date(inc.start);
    const span = inc.end
      ? `${fmtDateTime(start, lang)} → ${fmtTime(new Date(inc.end), lang)}`
      : fmtDateTime(start, lang);
    const outcome =
      inc.outcome === 'notFire'
        ? t('fire.outcome.notFire')
        : inc.outcome === 'extinguished'
          ? t('fire.outcome.extinguished')
          : t('fire.outcome.ongoing');
    what.appendChild(make('div', 'meta', `${span} · ${outcome}`));
    li.appendChild(what);
    list.appendChild(li);
  }
  host.appendChild(list);
}

/* ---- 119 dispatch counters ---------------------------------------------- */

const COUNT_GROUPS = ['fire', 'emergency', 'rescue', 'total'] as const;

function renderCounts(host: HTMLElement, file: FireFile, lang: Lang, t: T): void {
  host.textContent = '';
  const counts = file.counts;
  if (!counts) {
    host.appendChild(make('p', 'placeholder', t('fire.empty')));
    return;
  }

  const stats = make('div', 'stat-row');
  for (const group of COUNT_GROUPS) {
    const span = counts[group];
    if (!span) continue;
    const s = make('div', 'stat');
    s.appendChild(make('div', 'label', t(`fire.calls.${group}` as UIKey)));
    s.appendChild(make('div', 'value', fmtNum(span.today, lang)));
    s.appendChild(
      make('div', 'label', `${t('fire.calls.yesterday')} ${fmtNum(span.yesterday, lang)}`),
    );
    s.appendChild(make('div', 'label', `${t('fire.calls.year')} ${fmtNum(span.year, lang)}`));
    stats.appendChild(s);
  }
  host.appendChild(stats);

  if (counts.retrievedAt) {
    host.appendChild(
      muted(`${t('common.updated')} ${fmtDateTime(new Date(counts.retrievedAt), lang)}`, '12px'),
    ).style.marginTop = '12px';
  }
}

/* ---- yearly statistics -------------------------------------------------- */

function renderByYear(host: HTMLElement, stats: StatsFile, lang: Lang, t: T): void {
  const totals = stats.series.total ?? [];
  if (!totals.length) {
    chartMessage(host, t('fire.empty'));
    return;
  }
  barChart(
    host,
    stats.years.map((y, i) => ({ label: String(y), value: totals[i] ?? null })),
    {
      seriesName: t('fire.byYearTitle'),
      height: 180,
      xEvery: 1,
      valueFmt: (v) => fmtNum(v, lang),
      tableLabel: t('common.viewTable'),
      tableHead: [t('common.year'), t('fire.calls.fire')],
    },
  );
}

function renderCauses(host: HTMLElement, stats: StatsFile, lang: Lang, t: T): void {
  host.textContent = '';
  if (!stats.causes.length) {
    host.appendChild(make('p', 'placeholder', t('fire.empty')));
    return;
  }

  // "Other" and "Unknown" are usually the two biggest buckets, which would bury
  // the named causes this card exists to show — so they sort to the bottom.
  const vague = (key: string | null) => key === null || key === 'other' || key === 'unknown';
  const causes = [...stats.causes].sort(
    (a, b) => Number(vague(a.key)) - Number(vague(b.key)) || b.count - a.count,
  );

  const list = make('ul', 'rank-list');
  const max = Math.max(...causes.map((c) => c.count));
  for (const cause of causes) {
    const li = make('li');
    // Unmapped labels would render as Japanese on a translated page, so they
    // fall back to the "other" bucket's wording instead.
    const label = cause.key ? t(`fire.cause.${cause.key}` as UIKey) : t('fire.cause.other');
    li.appendChild(make('span', 'name', label));
    const track = make('span', 'track');
    const bar = make('span', 'bar');
    bar.style.width = `${Math.max(2, (cause.count / max) * 100)}%`;
    track.appendChild(bar);
    li.appendChild(track);
    li.appendChild(make('span', 'count', fmtNum(cause.count, lang)));
    list.appendChild(li);
  }
  host.appendChild(list);
}

const BREAKDOWN = [
  ['building', 'fire.type.building'],
  ['forest', 'fire.type.forest'],
  ['vehicle', 'fire.type.vehicle'],
  ['other', 'fire.type.other'],
  ['deaths', 'fire.deaths'],
  ['injuries', 'fire.injuries'],
] as const;

function renderBreakdown(host: HTMLElement, stats: StatsFile, lang: Lang, t: T): void {
  host.textContent = '';
  const m = stats.matsumoto;
  if (!m) {
    host.appendChild(make('p', 'placeholder', t('fire.empty')));
    return;
  }

  const stat = make('div', 'stat');
  stat.appendChild(make('div', 'label', t('fire.calls.fire')));
  stat.appendChild(make('div', 'value', m.total === null ? '—' : fmtNum(m.total, lang)));
  host.appendChild(stat);

  const stats_ = make('div', 'stat-row');
  for (const [key, label] of BREAKDOWN) {
    const value = m[key];
    if (value === null || value === undefined) continue;
    const s = make('div', 'stat');
    s.appendChild(make('div', 'label', t(label)));
    s.appendChild(make('div', 'value', fmtNum(value, lang)));
    stats_.appendChild(s);
  }
  host.appendChild(stats_);

  if (stats.region?.total) {
    host.appendChild(
      muted(`${t('fire.regionNote')} ${fmtNum(stats.region.total, lang)}`, '12px'),
    ).style.marginTop = '12px';
  }
}

/* ---- wiring ------------------------------------------------------------- */

export function initFirePage(): void {
  const lang = getLang();
  const t: T = (key) => ui[lang][key] ?? ui.en[key];
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  const liveHosts = {
    advisory: widget('fire-advisory'),
    active: widget('fire-active'),
    recent: widget('fire-recent'),
    counts: widget('fire-calls'),
  };
  if (Object.values(liveHosts).some(Boolean)) {
    fetch(`${base}/data/fire.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<FireFile>) : Promise.reject(res.status)))
      .then((file) => {
        if (liveHosts.advisory) renderAdvisory(liveHosts.advisory, file, lang, t);
        if (liveHosts.active) renderActive(liveHosts.active, file, lang, t);
        if (liveHosts.recent) renderRecent(liveHosts.recent, file, lang, t);
        if (liveHosts.counts) renderCounts(liveHosts.counts, file, lang, t);
      })
      .catch(() => {
        for (const host of Object.values(liveHosts)) {
          if (!host) continue;
          host.textContent = '';
          host.appendChild(make('p', 'placeholder', t('fire.empty')));
        }
      });
  }

  const statHosts = {
    byYear: widget('fire-year'),
    causes: widget('fire-causes'),
    breakdown: widget('fire-breakdown'),
  };
  if (Object.values(statHosts).some(Boolean)) {
    fetch(`${base}/data/fire-stats.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<StatsFile>) : Promise.reject(res.status)))
      .then((stats) => {
        for (const node of document.querySelectorAll<HTMLElement>('[data-fire-year]')) {
          node.textContent = String(stats.latestYear);
        }
        if (statHosts.byYear) renderByYear(statHosts.byYear, stats, lang, t);
        if (statHosts.causes) renderCauses(statHosts.causes, stats, lang, t);
        if (statHosts.breakdown) renderBreakdown(statHosts.breakdown, stats, lang, t);
      })
      .catch(() => {
        for (const host of Object.values(statHosts)) {
          if (!host) continue;
          host.textContent = '';
          host.appendChild(make('p', 'placeholder', t('fire.empty')));
        }
      });
  }
}
