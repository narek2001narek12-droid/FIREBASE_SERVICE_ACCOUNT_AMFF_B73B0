import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { qs, clear, el } from '../core/dom.js';
import { getTeamsCached } from '../core/data.js';

bindThemeButton('toggle-theme');
initTabbarActive('teams');

const grid = qs('#teams-grid');
const qInput = qs('#team-search');
const filterSel = qs('#division-filter');
const countEl = qs('#teams-count');

let teams = [];

function normDiv(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'first') return 'first';
  return 'high'; // default
}

function divLabel(div) {
  return div === 'first' ? 'Առաջին' : 'Բարձրագույն';
}

function card(t) {
  const logo = t.logo
    ? el('img', { class: 'logo', src: t.logo, alt: t.name || 'logo', loading: 'lazy' })
    : el('div', { class: 'logo placeholder', 'aria-hidden': 'true' }, 'AMF');

  const div = divLabel(normDiv(t.division));

  return el('a', { class: 'card team-card', href: `team.html?id=${encodeURIComponent(t.id)}` }, [
    el('div', { class: 'team-card-head' }, [
      logo,
      el('div', { class: 'team-card-meta' }, [
        el('div', { class: 'title' }, t.name || '—'),
        el('div', { class: 'muted' }, div),
      ]),
    ]),
  ]);
}

function apply() {
  if (!grid || !qInput || !filterSel || !countEl) return;

  const q = String(qInput.value || '').trim().toLowerCase();
  const div = String(filterSel.value || 'all').toLowerCase(); // all | high | first

  const list = teams.filter(t => {
    const td = normDiv(t.division);

    if (div !== 'all' && td !== div) return false;
    if (!q) return true;

    const name = String(t.name || '').toLowerCase();
    return name.includes(q);
  });

  countEl.textContent = String(list.length);

  clear(grid);
  if (!list.length) {
    grid.appendChild(el('div', { class: 'muted' }, 'Թիմեր չկան։'));
    return;
  }

  list.forEach(t => grid.appendChild(card(t)));
}

async function boot() {
  if (!grid) return;

  grid.innerHTML =
    '<div class="skeleton skeleton-card"></div>' +
    '<div class="skeleton skeleton-card"></div>' +
    '<div class="skeleton skeleton-card"></div>';

  teams = await getTeamsCached();
  apply();
}

// безопасная привязка событий
if (qInput) qInput.addEventListener('input', apply);
if (filterSel) filterSel.addEventListener('change', apply);

boot().catch(e => {
  console.error(e);
  if (!grid) return;
  clear(grid);
  grid.appendChild(el('div', { class: 'muted' }, 'Բեռնումը ձախողվեց։'));
});
