// Sets the colours before the page is drawn (loaded in <head> as a plain script, ahead
// of the stylesheet), so a saved choice never flashes the other theme first.
// The choice, 'light' or 'dark' in localStorage (none = Auto, follow the device), is made
// in the footer (app.js), which then fires 'rebattle-theme' on document. Writes
// data-theme="light"|"dark" on <html>; styles.css keys the day colours off it.
(function () {
  var media = window.matchMedia('(prefers-color-scheme: light)');
  function apply() {
    var choice = null;
    try {
      choice = localStorage.getItem('rebattle.theme');
    } catch (e) {
      // storage blocked: follow the device
    }
    var theme = choice === 'light' || choice === 'dark' ? choice : media.matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f5f2' : '#111318');
  }
  apply();
  media.addEventListener('change', apply);
  document.addEventListener('rebattle-theme', apply);
})();
