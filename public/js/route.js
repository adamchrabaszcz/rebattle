// Which screen an address means. Pure, so it is tested in Node.
//   /                  your last tournament if it is still running, else your list,
//                      or the introduction in a browser with nothing saved (?view: read-only)
//   /tournaments       your tournament list
//   /about             the introduction
//   /competitions      the competitions organisers listed on rebattle.app
//   /brand             the logo files and how to use them
//   /t/<code>          public live view of a cloud tournament
//   /t/<code>/<rider>  a rider's "follow me" card
//   /manage/<code>     organiser screen (behind login)
// Codes and rider slugs: lowercase letters, digits and inner dashes, e.g. cable-open-x7k2.

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function parseRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length || (parts.length === 1 && parts[0] === 'index.html')) return { name: 'home' };
  if (parts.length === 1 && parts[0] === 'tournaments') return { name: 'list' };
  if (parts.length === 1 && parts[0] === 'about') return { name: 'about' };
  if (parts.length === 1 && parts[0] === 'competitions') return { name: 'competitions' };
  if (parts.length === 1 && parts[0] === 'brand') return { name: 'brand' };
  if (parts[0] === 't' && SLUG.test(parts[1] || '')) {
    if (parts.length === 2) return { name: 'view', code: parts[1] };
    if (parts.length === 3 && SLUG.test(parts[2])) return { name: 'rider', code: parts[1], rider: parts[2] };
  }
  if (parts[0] === 'manage' && parts.length === 2 && SLUG.test(parts[1])) return { name: 'manage', code: parts[1] };
  return { name: 'notFound' };
}

// "Follow a competition": a typed code (as on a poster) or a pasted / scanned link,
// to the public page's path, or null if it can't be one.
export function followPath(input) {
  const s = String(input || '').trim().toLowerCase();
  const link = s.match(/\/t\/([^/?#\s]+)(?:\/([^/?#\s]+))?/);
  const code = s.replace(/\s+/g, '-');
  if (!link && !SLUG.test(code)) return null;
  const route = parseRoute(link ? '/t/' + link[1] + (link[2] ? '/' + link[2] : '') : '/t/' + code);
  if (route.name === 'view') return '/t/' + route.code;
  return route.name === 'rider' ? `/t/${route.code}/${route.rider}` : null;
}
