// New tournament: setup form, time estimate and the names screen.

import * as Bracket from '../engine/bracket.js';
import { brandLogo, escapeHtml, fmtDuration } from './html.js';

// ---- Setup ---------------------------------------------------------------

function computeEstimateHtml(n, lapTimeSeconds, breakSeconds, heatFormat) {
  if (!n || n < 4) {
    return `<p class="empty">Enter at least 4 competitors to see bracket size and time estimate.</p>`;
  }
  const bracketSize = Bracket.nextPowerOfTwo(n);
  const byes = bracketSize - n;
  const est = Bracket.estimateDurationSeconds(n, lapTimeSeconds || 0, breakSeconds || 0);
  return `
    <div class="estimate">
      <div class="row"><span>Bracket size</span><span>${bracketSize} (${byes} bye${byes === 1 ? '' : 's'} in round 1)</span></div>
      <div class="row"><span>Total heats</span><span>${est.heats}</span></div>
      <div class="row"><span>Estimated time &mdash; single run</span><span>${fmtDuration(est.single)}</span></div>
      <div class="row"><span>Estimated time &mdash; best of 3</span><span>${fmtDuration(est.bo3Min)} &ndash; ${fmtDuration(est.bo3Max)}</span></div>
    </div>
  `;
}

function renderSetup(state) {
  const d = state.draft;
  return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1 small">${brandLogo()}</h1><small>Setup</small></div>
      <div class="toolbar"><button data-action="go-home">Back</button></div>
    </div>
    <div class="card">
      <h2>Tournament setup</h2>
      <div class="field">
        <label for="f-name">Tournament name</label>
        <input type="text" id="f-name" placeholder="e.g. Cable Park Open &mdash; Juniors" value="${escapeHtml(d.name || '')}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-count">Number of competitors</label>
          <input type="number" id="f-count" min="4" step="1" value="${d.competitorCount || ''}" />
        </div>
        <div class="field">
          <label for="f-lap">Lap time (seconds)</label>
          <input type="number" id="f-lap" min="1" step="1" value="${d.lapTimeSeconds || ''}" />
        </div>
        <div class="field">
          <label for="f-break">Break between heats (seconds, optional)</label>
          <input type="number" id="f-break" min="0" step="1" value="${d.breakSeconds || 0}" />
        </div>
      </div>

      <div id="estimate-holder">${computeEstimateHtml(d.competitorCount, d.lapTimeSeconds, d.breakSeconds, d.heatFormat)}</div>

      <div class="field" style="max-width:none; margin-top:18px;">
        <label>Heat format</label>
        <div class="format-options">
          <label class="format-option ${d.heatFormat === 'single' ? 'selected' : ''}">
            <input type="radio" name="heatFormat" value="single" ${d.heatFormat === 'single' ? 'checked' : ''} />
            <div class="label">Single run</div>
            <div class="sub">Fastest. One lap decides the heat.</div>
          </label>
          <label class="format-option ${d.heatFormat === 'bo3' ? 'selected' : ''}">
            <input type="radio" name="heatFormat" value="bo3" ${d.heatFormat === 'bo3' ? 'checked' : ''} />
            <div class="label">Best of 3</div>
            <div class="sub">First to 2 wins. Up to 3 laps per heat.</div>
          </label>
        </div>
      </div>

      ${
        state.organiser
          ? `<label class="check"><input type="checkbox" id="f-local" ${d.localOnly ? 'checked' : ''} /> Keep in this browser only (don&rsquo;t save online)</label>`
          : ''
      }

      <div style="margin-top:22px;">
        <button class="primary" data-action="setup-next">Next: enter competitors</button>
      </div>
    </div>
  `;
}

// ---- Names -----------------------------------------------------------

function renderNames(state) {
  const n = state.draft.competitorCount;
  const names = state.draft.names || Array.from({ length: n }, () => '');
  const inputs = names
    .map(
      (val, i) => `<input type="text" class="name-input" data-index="${i}" placeholder="Competitor ${i + 1}" value="${escapeHtml(val)}" />`
    )
    .join('');

  return `
    <div class="topbar">
      <div class="title"><h1>${escapeHtml(state.draft.name || 'New tournament')}</h1><small>Enter competitors</small></div>
      <div class="toolbar"><button data-action="go-setup-back">Back</button></div>
    </div>
    <div class="card">
      <h2>Competitor names (${n})</h2>
      <p>Names will be randomly drawn into the bracket, including random byes if ${n} isn't a power of two.</p>
      <div class="name-grid">${inputs}</div>
      <button class="primary" data-action="names-draw">Draw bracket</button>
      <span id="names-error" class="inline-error"></span>
    </div>
  `;
}

export { renderSetup, renderNames, computeEstimateHtml };
