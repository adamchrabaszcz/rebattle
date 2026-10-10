// Connector lines and path tracing, measured from the rendered cards (DOM).

// ---- connector lines -------------------------------------------------------

// Shared column width for all brackets on desktop: sized so the bracket
// with the most rounds fills the width (230-360px per column). On phones
// (one round at a time) the property is removed.
const COL_GAP = 56;
function syncColumns(root) {
  const graphs = [...root.querySelectorAll('.bracket-graph:not(.final4-graph)')];
  if (!graphs.length || window.matchMedia('(max-width: 700px)').matches) {
    root.style.removeProperty('--col-w');
    return;
  }
  const n = Math.max(...graphs.map((g) => g.querySelectorAll('.bracket-column').length));
  const width = graphs[0].clientWidth;
  const w = Math.max(230, Math.min(360, (width - COL_GAP * (n - 1)) / n));
  root.style.setProperty('--col-w', Math.floor(w) + 'px');
}

function drawConnectors(root) {
  syncColumns(root);
  root.querySelectorAll('.bracket-graph').forEach((graph) => {
    const svg = graph.querySelector('svg.bracket-lines');
    let edges = [];
    try {
      edges = JSON.parse(graph.dataset.edges || '[]');
    } catch (e) {
      edges = [];
    }
    // Collapse first so a stale, wider SVG doesn't inflate scrollWidth.
    svg.setAttribute('width', 0);
    svg.setAttribute('height', 0);
    const g = graph.getBoundingClientRect();
    const ox = graph.scrollLeft - g.left;
    const oy = graph.scrollTop - g.top;
    svg.setAttribute('width', graph.scrollWidth);
    svg.setAttribute('height', graph.scrollHeight);

    const lines = edges
      .map((e) => {
        const from = graph.querySelector(`[data-match-id="${e.from}"]`);
        const to = graph.querySelector(`[data-match-id="${e.to}"]`);
        if (!from || !to) return '';
        const fromSlot = e.done ? from.querySelector(e.kind === 'lose' ? '.slot.loser' : '.slot.winner') : null;
        const toSlot = e.slot ? to.querySelector(`.slot[data-slot="${e.slot}"]`) : null;
        const fr = from.getBoundingClientRect();
        const tr = to.getBoundingClientRect();
        const fy = (fromSlot || from).getBoundingClientRect();
        const ty = (toSlot || to).getBoundingClientRect();
        const x1 = fr.right + ox;
        const y1 = fy.top + fy.height / 2 + oy;
        const x2 = tr.left + ox;
        const y2 = ty.top + ty.height / 2 + oy;
        // Winner and loser lines bend at different x so their verticals don't overlap.
        return { from: e.from, to: e.to, slot: e.slot, x1, y1, x2, y2, bend: e.bend != null ? e.bend : e.kind === 'lose' ? 0.65 : 0.4, cls: ['edge', e.kind, e.done ? 'done' : ''].join(' ') };
      })
      .filter(Boolean);

    if (graph.dataset.stagger) {
      const gaps = {};
      lines.forEach((l) => (gaps[Math.round(l.x1)] = gaps[Math.round(l.x1)] || []).push(l));
      Object.values(gaps).forEach((group) => {
        group.sort((a, b) => a.y1 - b.y1);
        group.forEach((l, i) => (l.bend = group.length > 1 ? 0.2 + (0.6 * i) / (group.length - 1) : 0.5));
      });
    }

    lines.forEach((l) => (l.mx = l.x1 + (l.x2 - l.x1) * l.bend));

    // Line hops: wherever a horizontal run crosses another line's vertical,
    // it bumps over it, so a crossing never looks like a junction.
    const HOP = 5;
    const hopsOn = (self, y, xa, xb) =>
      lines
        .filter((o) => o !== self)
        .filter((o) => {
          const lo = Math.min(o.y1, o.y2);
          const hi = Math.max(o.y1, o.y2);
          return o.mx > xa + HOP && o.mx < xb - HOP && y > lo + 1 && y < hi - 1;
        })
        .map((o) => o.mx)
        .sort((a, b) => a - b)
        .filter((x, i, xs) => i === 0 || x - xs[i - 1] > 2 * HOP + 2);
    const run = (self, y, xa, xb) =>
      hopsOn(self, y, xa, xb)
        .map((x) => ` H${x - HOP} A${HOP} ${HOP} 0 0 1 ${x + HOP} ${y}`)
        .join('') + ` H${xb}`;

    svg.innerHTML = lines
      .map((l) => {
        const d = `M${l.x1} ${l.y1}${run(l, l.y1, l.x1, l.mx)} V${l.y2}${run(l, l.y2, l.mx, l.x2)}`;
        return `<path class="${l.cls}" d="${d}" data-from="${l.from}" data-to="${l.to}" data-slot="${l.slot || ''}" />`;
      })
      .join('');
  });
}

// ---- path tracing ----------------------------------------------------------
//
// Hovering a competitor highlights every heat they're in and every line
// they travelled along. An edge belongs to their path when they appear in
// its source heat and sit in the exact slot it feeds in the target heat.

function tracePath(root, cid) {
  root.classList.toggle('tracing', !!cid);
  root.querySelectorAll('.path-hl').forEach((el) => el.classList.remove('path-hl'));
  root.querySelectorAll('.path-card').forEach((el) => el.classList.remove('path-card'));
  root.querySelectorAll('path.edge.path').forEach((el) => el.classList.remove('path'));
  if (!cid) return;

  const sel = `[data-cid="${cid}"]`;
  root.querySelectorAll(sel).forEach((el) => {
    el.classList.add('path-hl');
    const card = el.closest('.match-card');
    if (card) card.classList.add('path-card');
  });
  root.querySelectorAll('.bracket-graph').forEach((graph) => {
    graph.querySelectorAll('path.edge').forEach((p) => {
      const from = graph.querySelector(`[data-match-id="${p.dataset.from}"]`);
      const to = graph.querySelector(`[data-match-id="${p.dataset.to}"]`);
      const target = to && p.dataset.slot ? to.querySelector(`.slot[data-slot="${p.dataset.slot}"]`) : null;
      if (from && from.querySelector(sel) && target && target.dataset.cid === cid) {
        p.classList.add('path');
        p.parentNode.appendChild(p); // draw on top of the dimmed lines
      }
    });
  });
}

export { drawConnectors, tracePath };
