/** Minimal hand-rolled SVG charts.
 *  Specs: 2px lines with round joins, ≥8px end markers with a 2px surface ring,
 *  columns ≤24px with 4px rounded data-ends (square at the baseline), solid
 *  hairline gridlines, selective direct labels, crosshair + tooltip with
 *  keyboard support, and a table-view twin for every chart. */

const NS = 'http://www.w3.org/2000/svg';

export interface Point {
  label: string;
  value: number | null;
}

export interface ChartOptions {
  seriesName: string;
  unit?: string;
  color?: string;
  height?: number;
  yDomain?: [number, number];
  /** show an x tick label every n points */
  xEvery?: number;
  valueFmt?: (v: number) => string;
  tableLabel: string;
  tableHead: [string, string];
}

interface Scale {
  x: (i: number) => number;
  y: (v: number) => number;
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function niceStep(span: number, target: number): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * mag) return m * mag;
  }
  return 10 * mag;
}

function domain(points: Point[], fixed?: [number, number]): [number, number] {
  if (fixed) return fixed;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (!vals.length) return [0, 1];
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

function buildScale(n: number, dom: [number, number], w: number, h: number): Scale {
  const padL = 38;
  const padR = 46; // room for the endpoint direct label
  const padT = 16;
  const padB = 24;
  return {
    x: (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR)),
    y: (v) => padT + (1 - (v - dom[0]) / (dom[1] - dom[0])) * (h - padT - padB),
    w,
    h,
    padL,
    padR,
    padT,
    padB,
  };
}

function drawGrid(
  svg: SVGSVGElement,
  s: Scale,
  dom: [number, number],
  fmt: (v: number) => string,
): void {
  const g = el('g', { class: 'axis' });
  const step = niceStep(dom[1] - dom[0], 4);
  const first = Math.ceil(dom[0] / step) * step;
  let prevLabel: string | null = null;
  for (let v = first; v <= dom[1] + 1e-9; v += step) {
    const y = s.y(v);
    g.appendChild(
      el('line', { x1: s.padL, x2: s.w - s.padR, y1: y, y2: y, class: 'gridline' }),
    );
    const text = fmt(v);
    if (text === prevLabel) continue; // fractional steps can round to the same label
    prevLabel = text;
    const label = el('text', { x: s.padL - 6, y: y + 3.5, 'text-anchor': 'end' });
    label.textContent = text;
    g.appendChild(label);
  }
  svg.appendChild(g);
}

function drawXLabels(svg: SVGSVGElement, s: Scale, points: Point[], every: number): void {
  const g = el('g', { class: 'axis' });
  for (let i = 0; i < points.length; i += every) {
    const t = el('text', { x: s.x(i), y: s.h - 6, 'text-anchor': 'middle' });
    t.textContent = points[i]!.label;
    g.appendChild(t);
  }
  svg.appendChild(g);
}

function buildTableTwin(host: HTMLElement, opts: ChartOptions, points: Point[]): void {
  const details = document.createElement('details');
  details.className = 'table-view';
  const summary = document.createElement('summary');
  summary.textContent = opts.tableLabel;
  details.appendChild(summary);
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const [i, name] of opts.tableHead.entries()) {
    const th = document.createElement('th');
    if (i === 1) th.className = 'num';
    th.textContent = name;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const fmt = opts.valueFmt ?? ((v: number) => String(v));
  for (const p of points) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = p.label;
    const td2 = document.createElement('td');
    td2.className = 'num';
    td2.textContent = p.value === null ? '—' : `${fmt(p.value)}${opts.unit ?? ''}`;
    tr.append(td1, td2);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroll.appendChild(table);
  details.appendChild(scroll);
  host.appendChild(details);
}

interface Tip {
  show: (svgX: number, title: string, value: string, color: string) => void;
  hide: () => void;
}

function buildTip(viz: HTMLElement, seriesName: string): Tip {
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  const title = document.createElement('div');
  title.className = 'tip-title';
  const row = document.createElement('div');
  row.className = 'tip-row';
  const key = document.createElement('span');
  key.className = 'tip-key';
  const value = document.createElement('span');
  value.className = 'tip-value';
  const label = document.createElement('span');
  label.className = 'tip-label';
  label.textContent = seriesName;
  row.append(key, value, label);
  tip.append(title, row);
  viz.appendChild(tip);

  return {
    show(svgX, t, v, color) {
      title.textContent = t;
      value.textContent = v;
      key.style.color = color;
      tip.classList.add('show');
      const vizRect = viz.getBoundingClientRect();
      const svg = viz.querySelector('svg')!;
      const svgRect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const px = svgRect.left - vizRect.left + (svgX / vb.width) * svgRect.width;
      const tw = tip.offsetWidth;
      let left = px + 14;
      if (left + tw > viz.clientWidth - 4) left = px - tw - 14;
      tip.style.left = `${Math.max(4, left)}px`;
      tip.style.top = '8px';
    },
    hide() {
      tip.classList.remove('show');
    },
  };
}

/** Index nearest to a pointer event, given the svg x scale. */
function nearestIndex(ev: PointerEvent, svg: SVGSVGElement, s: Scale, n: number): number {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const x = ((ev.clientX - rect.left) / rect.width) * vb.width;
  const t = (x - s.padL) / (s.w - s.padL - s.padR);
  return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
}

export function lineChart(host: HTMLElement, points: Point[], opts: ChartOptions): void {
  host.textContent = '';
  host.classList.add('viz');
  host.removeAttribute('aria-busy');

  const color = opts.color ?? 'var(--series-1)';
  const H = opts.height ?? 240;
  const W = 640;
  const fmt = opts.valueFmt ?? ((v: number) => String(Math.round(v)));
  const dom = domain(points, opts.yDomain);
  const s = buildScale(points.length, dom, W, H);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: 0 });
  svg.setAttribute('aria-label', opts.seriesName);
  drawGrid(svg, s, dom, fmt);
  drawXLabels(svg, s, points, opts.xEvery ?? Math.ceil(points.length / 7));

  // area wash (~10% opacity) + 2px line
  const coords = points
    .map((p, i) => (p.value === null ? null : [s.x(i), s.y(p.value)] as const))
    .filter((c): c is readonly [number, number] => c !== null);
  if (coords.length > 1) {
    const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const baseY = s.h - s.padB;
    const area = `${line} L${coords[coords.length - 1]![0].toFixed(1)},${baseY} L${coords[0]![0].toFixed(1)},${baseY} Z`;
    svg.appendChild(el('path', { d: area, fill: color, opacity: 0.1 }));
    svg.appendChild(
      el('path', {
        d: line,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }),
    );
  }

  // crosshair (hidden until hover/focus)
  const crosshair = el('line', {
    class: 'crosshair',
    y1: s.padT,
    y2: s.h - s.padB,
    x1: -10,
    x2: -10,
    opacity: 0,
  });
  svg.appendChild(crosshair);
  const hoverDot = el('circle', { r: 4.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 });
  svg.appendChild(hoverDot);

  // selective direct labels: endpoint (with dot), max, min
  const valid = points
    .map((p, i) => ({ i, v: p.value }))
    .filter((p): p is { i: number; v: number } => p.v !== null);
  if (valid.length) {
    const last = valid[valid.length - 1]!;
    const maxP = valid.reduce((a, b) => (b.v > a.v ? b : a));
    const minP = valid.reduce((a, b) => (b.v < a.v ? b : a));

    svg.appendChild(
      el('circle', {
        cx: s.x(last.i),
        cy: s.y(last.v),
        r: 4.5,
        fill: color,
        stroke: 'var(--surface)',
        'stroke-width': 2,
      }),
    );
    const endLabel = el('text', {
      x: s.x(last.i) + 9,
      y: s.y(last.v) + 4,
      class: 'direct-label',
    });
    endLabel.textContent = `${fmt(last.v)}${opts.unit ?? ''}`;
    svg.appendChild(endLabel);

    for (const [p, dy] of [
      [maxP, -8],
      [minP, 16],
    ] as const) {
      if (p.i === last.i) continue;
      const t = el('text', {
        x: s.x(p.i),
        y: s.y(p.v) + dy,
        'text-anchor': 'middle',
        class: 'direct-label',
      });
      t.textContent = fmt(p.v);
      svg.appendChild(t);
    }
  }

  const viz = host;
  viz.appendChild(svg);
  const tip = buildTip(viz, opts.seriesName);

  const showAt = (i: number) => {
    const p = points[i];
    if (!p || p.value === null) return;
    const x = s.x(i);
    crosshair.setAttribute('x1', String(x));
    crosshair.setAttribute('x2', String(x));
    crosshair.setAttribute('opacity', '1');
    hoverDot.setAttribute('cx', String(x));
    hoverDot.setAttribute('cy', String(s.y(p.value)));
    hoverDot.setAttribute('opacity', '1');
    tip.show(x, p.label, `${fmt(p.value)}${opts.unit ?? ''}`, color);
  };
  const hide = () => {
    crosshair.setAttribute('opacity', '0');
    hoverDot.setAttribute('opacity', '0');
    tip.hide();
  };

  let focusIdx = points.length - 1;
  svg.addEventListener('pointermove', (ev) => showAt(nearestIndex(ev, svg, s, points.length)));
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => showAt(focusIdx));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      focusIdx = Math.max(0, Math.min(points.length - 1, focusIdx + (ev.key === 'ArrowRight' ? 1 : -1)));
      showAt(focusIdx);
    } else if (ev.key === 'Escape') {
      hide();
    }
  });

  buildTableTwin(host, opts, points);
}

/** Column path with a 4px rounded top and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  const x2 = x + w;
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x2 - r},${y} Q${x2},${y} ${x2},${y + r} L${x2},${y + h} Z`;
}

export function barChart(host: HTMLElement, points: Point[], opts: ChartOptions): void {
  host.textContent = '';
  host.classList.add('viz');
  host.removeAttribute('aria-busy');

  const color = opts.color ?? 'var(--series-1)';
  const H = opts.height ?? 200;
  const W = 640;
  const fmt = opts.valueFmt ?? ((v: number) => String(Math.round(v)));
  const dom = domain(points, opts.yDomain ?? [0, Math.max(...points.map((p) => p.value ?? 0), 4) * 1.15]);
  const s = buildScale(points.length, dom, W, H);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: 0 });
  svg.setAttribute('aria-label', opts.seriesName);
  drawGrid(svg, s, dom, fmt);
  drawXLabels(svg, s, points, opts.xEvery ?? Math.ceil(points.length / 7));

  const band = (s.w - s.padL - s.padR) / points.length;
  const barW = Math.min(24, Math.max(3, band - 2)); // 2px surface gap between neighbors
  const baseY = s.h - s.padB;

  svg.appendChild(el('line', { x1: s.padL, x2: s.w - s.padR, y1: baseY, y2: baseY, class: 'baseline' }));

  const bars: (SVGPathElement | null)[] = points.map((p, i) => {
    if (p.value === null || p.value <= dom[0]) return null;
    const cx = s.padL + band * i + band / 2;
    const y = s.y(Math.min(p.value, dom[1]));
    const h = baseY - y;
    if (h <= 0) return null;
    const path = el('path', { d: columnPath(cx - barW / 2, y, barW, h), fill: color });
    svg.appendChild(path);
    return path;
  });

  const viz = host;
  viz.appendChild(svg);
  const tip = buildTip(viz, opts.seriesName);

  let lifted: SVGPathElement | null = null;
  const showAt = (i: number) => {
    const p = points[i];
    if (!p) return;
    if (lifted) lifted.setAttribute('opacity', '1');
    lifted = bars[i] ?? null;
    lifted?.setAttribute('opacity', '0.8');
    const cx = s.padL + band * i + band / 2;
    tip.show(cx, p.label, p.value === null ? '—' : `${fmt(p.value)}${opts.unit ?? ''}`, color);
  };
  const hide = () => {
    if (lifted) lifted.setAttribute('opacity', '1');
    lifted = null;
    tip.hide();
  };

  // whole-band hit target: pointer anywhere over the plot maps to the nearest bar
  let focusIdx = points.length - 1;
  svg.addEventListener('pointermove', (ev) => {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const x = ((ev.clientX - rect.left) / rect.width) * vb.width;
    const i = Math.max(0, Math.min(points.length - 1, Math.floor((x - s.padL) / band)));
    showAt(i);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => showAt(focusIdx));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      focusIdx = Math.max(0, Math.min(points.length - 1, focusIdx + (ev.key === 'ArrowRight' ? 1 : -1)));
      showAt(focusIdx);
    } else if (ev.key === 'Escape') {
      hide();
    }
  });

  buildTableTwin(host, opts, points);
}

/** Loading / error message inside a chart host. */
export function chartMessage(host: HTMLElement, text: string, isError = false): void {
  host.textContent = '';
  const p = document.createElement('p');
  p.className = `placeholder${isError ? ' error' : ''}`;
  p.textContent = text;
  host.appendChild(p);
}
