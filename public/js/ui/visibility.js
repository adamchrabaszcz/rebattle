// Who can find an online tournament: unlisted (the default) or listed on rebattle.app.
// The same two explained options wherever the organiser chooses (setup, the organiser
// screen), and one line saying which applies (the organiser screen, the share panel).

const OPTIONS = [
  ['unlisted', 'Unlisted', 'Only people with the link or QR code can follow it.'],
  ['listed', 'Listed on rebattle.app', 'Anyone can find it on rebattle.app and see the results, during the event and after.'],
];

function renderVisibilityOptions(listed) {
  return `
        <div class="format-options visibility-options">
          ${OPTIONS.map(
            ([value, label, sub]) => `
          <label class="format-option ${(value === 'listed') === !!listed ? 'selected' : ''}">
            <input type="radio" name="visibility" value="${value}" ${(value === 'listed') === !!listed ? 'checked' : ''} />
            <div class="label">${label}</div>
            <div class="sub">${sub}</div>
          </label>`
          ).join('')}
        </div>`;
}

// One line: what applies now and what it means, with the way to change it.
function renderVisibilityLine(listed) {
  const [, label, sub] = OPTIONS[listed ? 1 : 0];
  return `<span class="visibility-state">${label}</span> &middot; ${sub.charAt(0).toLowerCase() + sub.slice(1)} <button class="small" data-action="open-visibility">Change</button>`;
}

export { renderVisibilityOptions, renderVisibilityLine };
