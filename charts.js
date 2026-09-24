/* Hand-rolled SVG charts: donut (pie), line, gauge. All scale via viewBox. */

const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]; // a=0 at 12 o'clock, clockwise

function donutSlicePath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}

/**
 * slices: [{ id, label, value, color }] — order and colors must match between paired charts.
 * selId: highlighted category id (shared between charts so a tap shows both sides).
 */
function donut(slices, { selId = null, caption = '' } = {}) {
  const size = 240, c = size / 2, r1 = 108, r0 = 72;
  const total = sum(slices, s => s.value);
  let body = `<circle cx="${c}" cy="${c}" r="${(r0 + r1) / 2}" fill="none" stroke="var(--track)" stroke-width="${r1 - r0}"/>`;
  if (total > 0) {
    let a = 0;
    const gap = slices.filter(s => s.value > 0).length > 1 ? 0.012 : 0;
    for (const s of slices) {
      if (s.value <= 0) continue;
      const span = Math.min(s.value / total * Math.PI * 2, Math.PI * 2 - 0.0001);
      const a0 = a + gap / 2, a1 = a + span - gap / 2;
      const mid = a + span / 2;
      const sel = s.id === selId;
      const [dx, dy] = sel ? polar(0, 0, 7, mid) : [0, 0];
      const pct = s.value / total * 100;
      body += `<path class="slice ${sel ? 'sel' : ''} ${selId && !sel ? 'dim' : ''}" d="${donutSlicePath(c, c, r0, r1, a0, Math.max(a0 + 0.001, a1))}" fill="${s.color}" transform="translate(${dx.toFixed(2)},${dy.toFixed(2)})"
        data-action="slice" data-id="${s.id}" data-tip="${esc(s.label)}\n${money(s.value)} · ${pct.toFixed(1)}%" tabindex="0" role="button" aria-label="${esc(s.label)} ${money(s.value)}, ${pct.toFixed(1)} percent"></path>`;
      a += span;
    }
  }
  const sel = selId && slices.find(s => s.id === selId);
  const center = sel
    ? `<text x="${c}" y="${c - 14}" class="d-label">${esc(sel.label)}</text>
       <text x="${c}" y="${c + 14}" class="d-value">${esc(moneyShort(sel.value))}</text>
       <text x="${c}" y="${c + 36}" class="d-sub">${total ? (sel.value / total * 100).toFixed(1) : 0}% of total</text>`
    : `<text x="${c}" y="${c - 10}" class="d-label">${esc(caption)}</text>
       <text x="${c}" y="${c + 20}" class="d-value">${total ? esc(moneyShort(total)) : 'No data'}</text>`;
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(caption)} pie chart">${body}${center}</svg>`;
}

function niceMax(v) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** points: [{ label, value, tip, highlight }] */
function lineChart(points, { w = 520, h = 230, ref = null } = {}) {
  const padL = 44, padR = 14, padT = 16, padB = 30;
  const max = niceMax(Math.max(...points.map(p => p.value || 0), ref || 0) * 1.1);
  const last = points.reduce((k, p, i) => (p.value != null ? i : k), -1);
  const iw = w - padL - padR, ih = h - padT - padB;
  const x = i => padL + (points.length > 1 ? i * iw / (points.length - 1) : iw / 2);
  const y = v => padT + ih - (v / max) * ih;
  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = max * k / 4, yy = y(v);
    grid += `<line x1="${padL}" x2="${w - padR}" y1="${yy}" y2="${yy}" class="grid"/><text x="${padL - 8}" y="${yy + 4}" class="axis" text-anchor="end">${esc(moneyShort(Math.round(v)))}</text>`;
  }
  const xl = points.map((p, i) => `<text x="${x(i)}" y="${h - 8}" class="axis" text-anchor="middle">${esc(p.label)}</text>`).join('');
  const line = points.slice(0, last + 1).map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = last >= 0 ? `${line}L${x(last)},${y(0)}L${x(0)},${y(0)}Z` : '';
  const refLine = ref ? `<line x1="${padL}" x2="${w - padR}" y1="${y(ref)}" y2="${y(ref)}" class="ref"/><text x="${w - padR}" y="${y(ref) - 6}" class="axis ref-label" text-anchor="end">daily budget ${esc(moneyShort(Math.round(ref)))}</text>` : '';
  const dots = points.map((p, i) => p.value == null ? '' : `<g class="pt ${p.highlight ? 'hl' : ''}"><circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="16" data-tip="${esc(p.tip)}"/><circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="${p.highlight ? 6 : 4}"/></g>`).join('');
  const hi = points.findIndex(p => p.highlight);
  let callout = '';
  if (hi >= 0) {
    const bx = clamp(x(hi) + 12, padL, w - padR - 92), by = clamp(y(points[hi].value) - 46, 2, h - padB - 40);
    callout = `<g class="callout"><rect x="${bx}" y="${by}" width="92" height="38" rx="6"/><text x="${bx + 46}" y="${by + 16}" text-anchor="middle">${esc(moneyShort(points[hi].value))}</text><text x="${bx + 46}" y="${by + 30}" text-anchor="middle" class="sm">${esc(points[hi].calloutSub || 'Today')}</text></g>`;
  }
  return `<svg class="line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Line chart">
    <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cyan)" stop-opacity=".28"/><stop offset="1" stop-color="var(--cyan)" stop-opacity="0"/></linearGradient></defs>
    ${grid}${refLine}<path d="${area}" fill="url(#areaGrad)"/><path d="${line}" class="line"/>${callout}${dots}${xl}</svg>`;
}

function arcD(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** 270° gauge like the reference design. ratio 0..n (over 1 turns red). */
function gauge(ratio, label = '') {
  const size = 240, c = 120, r = 92;
  const a0 = -Math.PI * 0.75, sweep = Math.PI * 1.5;
  const val = clamp(ratio, 0, 1);
  const over = ratio > 1, warn = ratio * 100 >= S.alerts.warnAt;
  const cls = over ? 'over' : warn ? 'warn' : '';
  const prog = val > 0.001 ? `<path d="${arcD(c, c, r, a0, a0 + sweep * val)}" class="g-prog ${cls}"/>` : '';
  return `<svg class="gauge" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)} ${Math.round(ratio * 100)} percent">
    <path d="${arcD(c, c, r, a0, a0 + sweep)}" class="g-track"/>${prog}
    <text x="${c}" y="${c + 18}" class="g-value">${isFinite(ratio) ? Math.round(ratio * 100) : 0}%</text>
    <text x="${c}" y="${c + 46}" class="g-label">${esc(label)}</text></svg>`;
}

function progressBar(ratio, color) {
  const status = ratio * 100 >= S.alerts.overAt ? 'over' : ratio * 100 >= S.alerts.warnAt ? 'warn' : 'ok';
  return `<div class="bar ${status}"><span style="width:${clamp(ratio, 0, 1) * 100}%;${color ? `--bar:${color}` : ''}"></span></div>`;
}
