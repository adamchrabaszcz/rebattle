// Checks that a tournament object is safe to store and render: used for imported files
// in the browser and for every snapshot the Worker accepts. Pure, no DOM.

// A tournament from outside (a file, a request) is untrusted: its ids end up in HTML
// attributes, so apart from the free-text names every string must be a plain token,
// and the core shape must be there.
const TOKEN = /^[A-Za-z0-9_.-]{0,100}$/;
function validateTournament(t) {
  const fail = (why) => {
    throw new Error('This does not look like a rebattle tournament file (' + why + ').');
  };
  if (!t || typeof t !== 'object' || Array.isArray(t)) fail('not an object');
  if (typeof t.id !== 'string' || !t.id || !TOKEN.test(t.id)) fail('bad id');
  if (typeof t.name !== 'string') fail('missing name');
  if (!Array.isArray(t.competitors) || t.competitors.length < 4) fail('missing competitors');
  if (t.competitors.some((c) => !c || typeof c.name !== 'string' || typeof c.id !== 'string')) fail('bad competitor');
  if (!['in_progress', 'completed'].includes(t.status)) fail('bad status');
  if (!t.wb || !Array.isArray(t.wb.matches) || !t.lb || !Array.isArray(t.lb.matches) || !t.final4 || !t.settings) fail('missing bracket');
  (function walk(v, key, parent) {
    if (typeof v === 'string') {
      const isName = key === 'name' && (parent === t || t.competitors.includes(parent));
      if (!isName && !TOKEN.test(v)) fail('unexpected text in "' + key + '"');
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, String(i), v));
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], k, v));
    else if (!(v === null || typeof v === 'number' || typeof v === 'boolean')) fail('unexpected value');
  })(t, '', null);
  return t;
}

export { validateTournament };
