// Pure-ish rendering: builds HTML strings from app state. No state mutation here —
// app.js owns state and wires up event handling via data-action delegation.

import { renderBracketScreen } from './bracket-screen.js';
import { tabState } from './brackets.js';
import { drawConnectors, tracePath } from './connectors.js';
import { renderHome } from './home.js';
import { renderIntro } from './intro.js';
import { renderReplayScreen } from './replay-screen.js';
import { renderRiderScreen } from './rider.js';
import { renderLoading, renderNotFound } from './not-found.js';
import { renderNames, renderSetup } from './setup.js';

// Module-level so the highlight is re-applied after a re-render (e.g. after
// clicking "Won" while the pointer is still over someone).
let traceCid = null;
let tabsBound = false;
function bindTabs(container) {
  if (tabsBound) return;
  tabsBound = true;
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab-graph]');
    if (!btn) return;
    const key = btn.dataset.tabGraph;
    const i = Number(btn.dataset.tab);
    tabState[key] = i;
    const bar = btn.parentElement;
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    bar.nextElementSibling.querySelectorAll('.bracket-column').forEach((c) => c.classList.toggle('active', Number(c.dataset.col) === i));
  });
}

// Phones: a sideways swipe on a bracket moves to the next / previous round, like its
// tab. Only a clearly sideways move counts, so scrolling never changes rounds.
const SWIPE_MIN = 50; // px
let swipeBound = false;
function bindSwipes(container) {
  if (swipeBound) return;
  swipeBound = true;
  let start = null;
  container.addEventListener(
    'touchstart',
    (e) => {
      const graph = e.target.closest('.bracket-graph.has-tabs');
      start = graph && e.touches.length === 1 ? { graph, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    },
    { passive: true }
  );
  container.addEventListener(
    'touchend',
    (e) => {
      if (!start) return;
      const { graph, x, y } = start;
      start = null;
      const dx = e.changedTouches[0].clientX - x;
      const dy = e.changedTouches[0].clientY - y;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
      const bar = graph.previousElementSibling;
      if (!bar || !bar.offsetParent) return; // tabs hidden: the desktop layout shows every round
      const tabs = [...bar.querySelectorAll('[data-tab-graph]')];
      const next = tabs.findIndex((b) => b.classList.contains('active')) + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= tabs.length) return;
      tabs[next].click(); // the same path as tapping the tab
      tabs[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const col = graph.querySelector('.bracket-column.active');
      col.classList.remove('slide-from-left', 'slide-from-right');
      void col.offsetWidth; // restart the animation on a quick second swipe
      col.classList.add(dx < 0 ? 'slide-from-right' : 'slide-from-left');
    },
    { passive: true }
  );
}

let traceBound = false;
function bindTracing(container) {
  if (traceBound) return;
  traceBound = true;
  const update = (cid) => {
    if (cid === traceCid) return;
    traceCid = cid;
    tracePath(container, cid);
  };
  container.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-cid]');
    update(el ? el.dataset.cid : null);
  });
  container.addEventListener('mouseleave', () => update(null));
}

let lastContainer = null;
let resizeQueued = false;
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (resizeQueued || !lastContainer) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      drawConnectors(lastContainer);
      if (traceCid) tracePath(lastContainer, traceCid);
    });
  });
}

// ---- top-level dispatch --------------------------------------------------

function render(container, state) {
  lastContainer = container;
  bindTracing(container);
  bindTabs(container);
  bindSwipes(container);
  container.classList.toggle('wide', state.screen === 'bracket');
  if (state.screen === 'home') container.innerHTML = renderHome(state);
  else if (state.screen === 'intro') container.innerHTML = renderIntro(state);
  else if (state.screen === 'setup') container.innerHTML = renderSetup(state);
  else if (state.screen === 'names') container.innerHTML = renderNames(state);
  else if (state.screen === 'replay') container.innerHTML = renderReplayScreen(state);
  else if (state.screen === 'notFound') container.innerHTML = renderNotFound(state);
  else if (state.screen === 'loading') container.innerHTML = renderLoading();
  else if (state.screen === 'rider') container.innerHTML = renderRiderScreen(state);
  else if (state.screen === 'bracket') {
    container.innerHTML = renderBracketScreen(state);
    drawConnectors(container);
    if (traceCid) tracePath(container, traceCid);
    // Redraw once web fonts settle, since they can shift card positions.
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(() => {
        drawConnectors(container);
        if (traceCid) tracePath(container, traceCid);
      });
  }
}

export { render };
