// The brand page (/brand): the logo files to download, how the logo is made, how to use
// it, the colours, the type and what the name and logo may be used for. docs/brand.md is the source;
// tests/brand.test.js checks the colours and the files here match it.

import { brandHome, brandLogo } from './html.js';

const FILES = '/brand/';
const COLOURWAYS = [
  ['on-dark', 'On dark'],
  ['on-light', 'On light'],
  ['mono-dark', 'One colour, dark'],
  ['mono-white', 'One colour, white'],
];

const VERSIONS = [
  ['full', 'The logo', 'drop. bounceback. rebattle.', 'The main logo: posters, headers, the start of a video.'],
  ['name', 'The name', 'rebattle', 'Where the sentence is too long: footers, small headers, sponsor and partner slots.'],
  ['mark', 'The mark', 'r', 'Avatars, app icons, watermarks, the middle of a QR code.'],
  ['badge', 'The badge', 'r rebattle.app', 'Where to find us: stickers, slide and email footers, a corner of a layout without a QR code.'],
];

// [name, hex, use]; the same values as docs/brand.md (Colour).
const COLOURS = [
  ['Amber', '#ffb020', 'The one accent: the underline, buttons, focus'],
  ['Night', '#111318', 'The dark background'],
  ['Day', '#f6f5f2', 'The light background'],
  ['Text on dark', '#eceef2', 'The logo’s text on dark'],
  ['Muted on dark', '#9599a6', '“drop. bounceback.” on dark'],
  ['Text on light', '#111318', 'The logo’s text on light'],
  ['Muted on light', '#5f636d', '“drop. bounceback.” on light'],
  ['Green', '#35c17a', 'Advances, the winner’s path'],
  ['Violet', '#a685ff', 'Losers bracket, drops'],
  ['Red', '#e35b5b', 'Out (lost twice) only'],
];

// How the logo is made: [file in /brand/how/, title, caption]. The diagrams and the same
// captions come from tools/make-logo-story.py (tests/brand.test.js checks they match).
const STORY = [
  ['1-letter', 'The letter', 'Funnel Display Bold’s own “r”. The underline will sit below the baseline.'],
  ['2-drop', 'The drop', 'The stem ends in half a square, pointing down. Its tip takes 1 of the 4 parts between the baseline and the underline.'],
  ['3-bounce', 'The bounce', 'The arm ends in a point that follows the “e”, 3 parts away: the gap the drop leaves, used twice. Mirrored about the arm’s centre line.'],
  ['4-mark', 'The mark', 'The underline runs from the letter’s left edge to the bounce’s tip. One letter: drop, then bounce back.'],
];

const RULES = [
  '<strong>Clear space:</strong> keep at least the height of the “r” free around the logo.',
  '<strong>Minimum sizes:</strong> the logo 120 px / 30 mm wide, the name 48 px / 12 mm wide, the mark 16 px tall.',
  '<strong>Full colour</strong> on plain dark or light backgrounds; <strong>one colour</strong> on photos and for single-colour print.',
  '<strong>Square full stops</strong> belong to the sentence: never on the name or the mark.',
  '<strong>Don’t</strong> recolour the underline, stretch the logo, outline it, add effects, or retype it in any font. Use the files.',
];

const link = (path, label) => `<a href="${FILES}${path}" download>${label}</a>`;

function renderVersion([id, title, alt, use]) {
  return `
      <article class="brand-version">
        <div class="brand-tiles">
          <div class="brand-tile tile-dark"><img src="${FILES}logos/${id}-on-dark.svg" alt="${alt}" loading="lazy"></div>
          <div class="brand-tile tile-light"><img src="${FILES}logos/${id}-on-light.svg" alt="" loading="lazy"></div>
        </div>
        <h3>${title}</h3>
        <p>${use}</p>
        <ul class="brand-downloads">
          ${COLOURWAYS.map(([cw, label]) => `<li><span>${label}</span>${link(`logos/${id}-${cw}.svg`, 'SVG')}${link(`logos/${id}-${cw}.png`, 'PNG')}</li>`).join('')}
        </ul>
      </article>`;
}

function renderBrand() {
  return `
    <div class="topbar event-top">
      <div class="title"><h1>Brand</h1></div>
      ${brandHome()}
    </div>
    <section class="intro-lead brand-lead">
      <p>The rebattle logo, colours and type, for posters, announcements and anything that says your event runs on rebattle.</p>
      <a class="btn primary" href="${FILES}rebattle-brand.zip" download>Download everything (.zip)</a>
    </section>

    <section class="section">
      <h2>The logo</h2>
      <p class="intro-note">The logo is the whole sentence: drop, bounce back, rebattle. Its “r” tells it in one letter: the stem drops below the line, and the arm bounces back. Three versions and a badge, each in four colourways.</p>
      <div class="brand-versions">${VERSIONS.map(renderVersion).join('')}</div>
    </section>

    <section class="section" id="how">
      <h2>How the logo is made</h2>
      <p class="intro-note">One letter tells the name. Every measure comes from the gap between the baseline and the underline, split into 4 parts.</p>
      <ol class="story-steps">
        ${STORY.map(([file, title, text], i) => `
        <li>
          <img src="${FILES}how/${file}.svg" width="560" height="640" alt="${title}: ${text}" loading="lazy">
          <h3>${i + 1}. ${title}</h3>
          <p>${text}</p>
        </li>`).join('')}
      </ol>
      <h3 class="story-logo-title">The logo</h3>
      <img class="story-logo" src="${FILES}how/5-logo.svg" width="2340" height="450" alt="drop. bounceback. rebattle. Square full stops, the sentence’s punctuation. The same “r”: the mark, set in the name. The underline, drawn at reading pace." loading="lazy">
      <div class="story-live">
        ${brandLogo({ animate: true })}
        <button type="button" class="small" data-action="replay-logo">Play again</button>
      </div>
      <p class="brand-sheet">The whole sheet: ${link('how/sheet.svg', 'SVG')} ${link('how/sheet.png', 'PNG')}</p>
    </section>

    <section class="section">
      <h2>Using it</h2>
      <ul class="brand-rules">${RULES.map((r) => `<li>${r}</li>`).join('')}</ul>
      <img class="brand-usage" src="${FILES}logo-usage.svg" alt="Do: the full logo with clear space, the badge, the name, the mark as an avatar, one colour on photos and print. Don’t: the address set as a logo, the address joined to the sentence, a full stop on the name or mark, another underline colour, stretching, full colour on a busy background." loading="lazy">
    </section>

    <section class="section">
      <h2>Colours</h2>
      <p class="intro-note">Tap a colour to copy it.</p>
      <div class="brand-colours">
        ${COLOURS.map(([name, hex, use]) => `
        <button type="button" class="brand-colour" data-action="copy-colour" data-value="${hex}" title="Copy ${hex}">
          <span class="swatch" style="background:${hex}"></span>
          <strong>${name}</strong><code>${hex}</code><span class="use">${use}</span>
        </button>`).join('')}
      </div>
    </section>

    <section class="section">
      <h2>Type</h2>
      <div class="brand-type">
        <div><p class="type-display">Funnel Display</p><p>Headings and big titles. The logo is drawn from it, but never type the logo yourself: its “r” is its own.</p></div>
        <div><p class="type-sans">Funnel Sans</p><p>Everything else: text, labels, the address. Both are free (SIL Open Font Licence) on <a href="https://fonts.google.com/specimen/Funnel+Display" rel="noopener">Google Fonts</a>.</p></div>
      </div>
    </section>

    <section class="section">
      <h2>The address</h2>
      <p class="intro-note"><strong>rebattle.app</strong> is text, not a logo: Funnel Sans, a round dot, no underline, the same colour as the text around it. Put it under or next to the logo, never joined to it. Next to a QR code, just the address: the QR code already has the “r” in its middle.</p>
    </section>

    <section class="section">
      <h2>For social media</h2>
      <div class="brand-social">
        <figure><img src="${FILES}instagram/profile.png" alt="The r mark on the dark background" loading="lazy"><figcaption>Profile picture, 1080×1080 · ${link('instagram/profile.png', 'PNG')} ${link('instagram/profile.svg', 'SVG')}</figcaption></figure>
        <figure><img src="/icons/share-preview.png" alt="The logo with “Double-elimination brackets, run from your phone.”" loading="lazy"><figcaption>Link preview, 1200×630 · <a href="/icons/share-preview.png" download>PNG</a> ${link('share-preview.svg', 'SVG')}</figcaption></figure>
      </div>
    </section>

    <section class="section">
      <h2>Using the name and logo</h2>
      <p class="intro-note">The rebattle code is open source (MIT), but the name and logo are not part of that licence. You’re welcome to use them to show that your event runs on rebattle: on posters, in announcements, in videos. Please don’t use them as your own brand, change them, or put them on a copy of the app you run yourself. Not sure? <a href="https://github.com/adamchrabaszcz/rebattle/issues" rel="noopener">Ask us</a>.</p>
    </section>`;
}

export { renderBrand, VERSIONS, COLOURWAYS, COLOURS, STORY };
