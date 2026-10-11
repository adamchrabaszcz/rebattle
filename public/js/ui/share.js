// Sharing a public page: the link, copy / the phone's share sheet, a QR code to scan,
// and for the whole tournament a poster to print (shown only when printing).
// state.share: { url, title, poster } while the panel is open (app.js sets it).

import { qrcode } from '../vendor/qrcode.js';
import { brandLogo, escapeHtml, R_SHAPES } from './html.js';
import { renderVisibilityLine } from './visibility.js';

// The QR code as inline SVG: dark modules on white with the standard 4-module quiet
// zone, so phone cameras read it on any background. The "r" mark sits in the middle on
// a white square: the highest error correction (H) lets about 30% of the code be
// covered, and the square covers under 8%. Modules under it aren't drawn at all.
function qrSvg(text) {
  const q = qrcode(0, 'H');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let k = Math.round(n * 0.27); // the white square's side, in modules
  if ((n - k) % 2) k += 1; // centred on whole modules
  const lo = (n - k) / 2;
  const hi = lo + k;
  let d = '';
  for (let r = 0; r < n; r += 1)
    for (let c = 0; c < n; c += 1) if (q.isDark(r, c) && !(r >= lo && r < hi && c >= lo && c < hi)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const u = R_SHAPES.underline;
  const mark =
    `<svg x="${lo + 4 + 1}" y="${lo + 4 + 1}" width="${k - 2}" height="${k - 2}" viewBox="${R_SHAPES.viewBox}" shape-rendering="geometricPrecision">` +
    `<g transform="scale(1 -1)"><path fill="#111318" d="${R_SHAPES.letter}"/><rect x="${u.x}" y="${u.y}" width="${u.width}" height="${u.height}" fill="#ffb020"/></g></svg>`;
  return `<svg class="qr" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${escapeHtml(text)}"><rect width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#000"/>${mark}</svg>`;
}

const bare = (url) => url.replace(/^https?:\/\//, '');

function renderShare(state) {
  const s = state.share;
  if (!s) return '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return `
    <div class="card section share-panel">
      <h2>${escapeHtml(s.title)}</h2>
      <div class="share-body">
        <div class="share-qr">${qrSvg(s.url)}</div>
        <div class="share-side">
          <input type="text" readonly class="share-url" value="${escapeHtml(s.url)}" aria-label="Link to share" />
          <div class="toolbar">
            <button class="primary" data-action="copy-link">Copy link</button>
            ${canShare ? '<button data-action="native-share">Share&hellip;</button>' : ''}
            ${s.poster ? '<button data-action="print-poster">Print poster</button>' : ''}
            <button data-action="close-share">Close</button>
          </div>
          <p class="note">Anyone with the link can follow along. No account needed. Scan the code with a phone camera to open it.</p>
          ${s.listed === undefined ? '' : `<p class="visibility-line">${renderVisibilityLine(s.listed)}</p>`}
        </div>
      </div>
      ${s.poster ? renderPoster(s) : ''}
    </div>`;
}

// Only visible in print (styles.css, body.print-poster): an A4 page for the venue.
function renderPoster(s) {
  return `
      <div class="poster" aria-hidden="true">
        <div class="poster-brand">${brandLogo()}</div>
        <div class="poster-name">${escapeHtml(s.name)}</div>
        <div class="poster-qr">${qrSvg(s.url)}</div>
        <div class="poster-follow">Follow live at</div>
        <div class="poster-url">${escapeHtml(bare(s.url))}</div>
      </div>`;
}

export { renderShare, qrSvg };
