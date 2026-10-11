import * as Bracket from '../engine/bracket.js';
import { brandHome, escapeHtml } from './html.js';

// ---- replay ----------------------------------------------------------------
// The canvas and its controls are driven by replay/player.js, mounted by
// app.js after this HTML is in the DOM.

function renderReplayScreen(state) {
  const t = state.tournament;
  return `
    <div class="topbar event-top">
      <div class="title"><h1>${escapeHtml(t.name)}</h1><small data-replay="subtitle">Replay</small></div>
      ${brandHome()}
    </div>
    <div class="toolbar event-toolbar replay-top">
      <button class="primary" data-replay="export">Download video</button>
      <button data-replay="share" hidden>Share&hellip;</button>
      <button class="replay-back" data-action="close-replay">Back to bracket</button>
    </div>
    <div class="replay">
      <div class="replay-stage">
        <canvas id="replay-canvas" width="1080" height="1920"></canvas>
        <div class="replay-tip" data-replay="tip" hidden></div>
      </div>
      <div class="replay-controls">
        <div class="replay-row">
          <button data-replay="play">Pause</button>
          <button data-replay="restart">Restart</button>
          <input type="range" min="0" step="10" value="0" data-replay="scrub" aria-label="Replay position" />
          <span class="replay-time" data-replay="time"></span>
        </div>
        <div class="replay-row">
          <label for="replay-focus" style="margin:0;">Show</label>
          <select id="replay-focus" data-replay="focus">
            <option value="">Whole competition</option>
            ${Bracket.getPlacings(t)
              .map(({ id, place }) => `<option value="${id}">${escapeHtml(Bracket.getName(t, id))} &mdash; ${place}.</option>`)
              .join('')}
          </select>
        </div>
        <p class="replay-status" data-replay="status">Vertical 1080&times;1920 &mdash; ready for Stories, Reels and TikTok.</p>
      </div>
    </div>
  `;
}

export { renderReplayScreen };
