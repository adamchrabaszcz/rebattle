// Which screen an address means. Pure, so it is tested in Node.
//   /                  the app (local tournaments; ?view opens one read-only)
//   /t/<code>          public live view of a cloud tournament
//   /t/<code>/<rider>  a rider's "follow me" card
//   /manage/<code>     organiser screen (behind login)
// Codes and rider slugs: lowercase letters, digits and inner dashes, e.g. cable-open-x7k2.

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function parseRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length || (parts.length === 1 && parts[0] === 'index.html')) return { name: 'home' };
  if (parts[0] === 't' && SLUG.test(parts[1] || '')) {
    if (parts.length === 2) return { name: 'view', code: parts[1] };
    if (parts.length === 3 && SLUG.test(parts[2])) return { name: 'rider', code: parts[1], rider: parts[2] };
  }
  if (parts[0] === 'manage' && parts.length === 2 && SLUG.test(parts[1])) return { name: 'manage', code: parts[1] };
  return { name: 'notFound' };
}
