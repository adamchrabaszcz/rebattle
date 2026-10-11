// The introduction (/about, and / in a browser with nothing saved): what rebattle
// is, following a competition by its code, how the format works, and how to start.

import { brandLogo } from './html.js';

const STEPS = [
  ['wb', 'Winners bracket', 'Everyone starts here. Win and you move on. Lose once and you drop to the Losers bracket: no one is out after one bad run.'],
  ['lb', 'Losers bracket', 'Your second chance. Pairings are a random draw each round. Lose here and you&rsquo;re out.'],
  ['f4', 'Final 4', 'The top two of each bracket cross over: WB 1st meets LB 2nd, WB 2nd meets LB 1st. The winners ride the Grand Final, the others the Small Final.'],
];

// state.hasWork: tournaments saved on this device (shows the way to the list).
function renderIntro(state) {
  return `
    <div class="topbar">
      <div class="title"><h1 class="brand-h1">${brandLogo({ animate: true })}</h1></div>
      ${state.hasWork ? '<div class="toolbar"><a class="btn" href="/tournaments">Your tournaments</a></div>' : ''}
    </div>
    <section class="intro-lead">
      <p class="intro-big">Head-to-head competitions where one bad run doesn&rsquo;t end your day.</p>
      <p>rebattle runs a double-elimination bracket from the organiser&rsquo;s phone, and gives everyone else a live page, a page for each rider and a replay video to share.</p>
    </section>
    <div class="card intro-follow" id="follow">
      <h2>Follow a competition</h2>
      <p>Type the code from the poster, or paste the link you were sent.</p>
      <div class="follow-row">
        <input type="text" id="f-follow" placeholder="e.g. cable-open-x7k2" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Competition code or link" />
        <button class="primary" data-action="follow">Follow</button>
      </div>
      <p class="field-error" id="follow-error" role="alert"></p>
    </div>
    <section class="section intro-how">
      <h2>How it works</h2>
      <ol class="intro-steps">
        ${STEPS.map(([kind, title, text], i) => `<li class="step-${kind}"><span class="step-num">${i + 1}</span><div><strong>${title}</strong><p>${text}</p></div></li>`).join('')}
      </ol>
    </section>
    <div class="card intro-organisers">
      <h2>For organisers</h2>
      <p>Set up a bracket in a minute, record each heat with one tap, keep going when the venue wifi drops. Without an account it&rsquo;s saved in this browser. Organisers with an account save online and get the live link, the QR poster and rider pages.</p>
      <div class="toolbar"><button class="primary" data-action="go-setup">Start a tournament</button></div>
    </div>
  `;
}

export { renderIntro };
