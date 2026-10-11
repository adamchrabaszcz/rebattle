// Sharing a public page: the link, copy / the phone's share sheet, a QR code to scan,
// and for the whole tournament a poster to print (shown only when printing).
// state.share: { url, title, poster } while the panel is open (app.js sets it).

import { qrcode } from '../vendor/qrcode.js';
import { brandLogo, escapeHtml } from './html.js';

// The QR code as inline SVG: dark modules on white with the standard 4-module quiet
// zone, so phone cameras read it on any background. Medium error correction.
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${escapeHtml(text)}"><rect width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
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
