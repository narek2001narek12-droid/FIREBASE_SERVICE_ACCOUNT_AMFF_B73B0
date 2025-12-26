import { db } from '../../../firebase.js';
import { fmtDate } from '../../../utils.js';
import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { qs, qsa, clear, el } from '../core/dom.js';
import { getTeamsCached, teamsToMap } from '../core/data.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('matches');

const DIVS = ['high','first','cup','structure'];
let activeDiv = 'high';
let activeType = 'upcoming';
let activeTeam = '';

const teamSel = qs('#team-filter');
const typeBtns = qsa('[data-match-type]');
const divBtns = qsa('[data-div]');
const listHost = qs('#match-list');

let teamsMap = {};
let matchesByDiv = { high: [], first: [], cup: [], structure: [] };

function toDate(m) {
  const d = new Date(`${(m.date||'1970-01-01')}T${(m.time||'00:00')}`);
  return isNaN(d) ? new Date(0) : d;
}

function divLabel(div){
  switch(div){
    case 'high': return 'Բարձրագույն';
    case 'first': return 'Առաջին';
    case 'cup': return 'Գավաթ';
    case 'structure': return '24 Թիմ';
    default: return div;
  }
}

function setActiveButtons() {
  divBtns.forEach(b=> b.classList.toggle('active', b.getAttribute('data-div')===activeDiv));
  typeBtns.forEach(b=> b.classList.toggle('active', b.getAttribute('data-match-type')===activeType));
}

function matchCard(m) {
  const homeId = m.home ?? m.homeId;
  const awayId = m.away ?? m.awayId;
  const home = teamsMap[homeId] || { name: m.homeName || '—' };
  const away = teamsMap[awayId] || { name: m.awayName || '—' };
  const dt = toDate(m);
  return el('a', { class: 'card match-row link-card', href: `match.html?div=${encodeURIComponent(activeDiv)}&id=${encodeURIComponent(m.id||'')}` }, [
    el('div', { class: 'meta' }, [
      el('span', { class: 'badge' }, divLabel(activeDiv)),
      el('span', { class: 'muted' }, fmtDate.format(dt)),
    ]),
    el('div', { class: 'row' }, [
      el('div', { class: 'side' }, home.name),
      el('div', { class: 'score' }, m.score || '—'),
      el('div', { class: 'side right' }, away.name),
    ])
  ]);
}

function render() {
  setActiveButtons();
  clear(listHost);

  const now = new Date();
  let list = (matchesByDiv[activeDiv] || []).slice();

  if (activeTeam) {
    list = list.filter(m => (m.home ?? m.homeId) === activeTeam || (m.away ?? m.awayId) === activeTeam);
  }

  list = list.filter(m => {
    const dt = toDate(m);
    if (activeType === 'upcoming') return dt >= now;
    if (activeType === 'past') return dt < now;
    return true;
  });

  list.sort((a,b) => toDate(a) - toDate(b));
  if (activeType === 'past') list.sort((a,b) => toDate(b) - toDate(a));

  if (!list.length) {
    listHost.appendChild(el('div', { class: 'muted' }, 'Տվյալներ չկան։'));
    return;
  }

  list.slice(0, 80).forEach(m => listHost.appendChild(matchCard(m)));
}

async function loadMatches(div){
  try {
    const snap = await getDocs(query(collection(db, `matches/${div}/games`), orderBy('date','asc')));
    matchesByDiv[div] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    matchesByDiv[div] = [];
  }
}

async function boot(){
  listHost.innerHTML = '<div class="skeleton skeleton-block"></div><div class="skeleton skeleton-block"></div>';

  const teams = await getTeamsCached();
  teamsMap = teamsToMap(teams);

  // team filter
  teamSel.innerHTML = '<option value="">Բոլոր թիմերը</option>' + teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  teamSel.addEventListener('change', () => { activeTeam = teamSel.value; render(); });

  await Promise.all(DIVS.map(loadMatches));

  divBtns.forEach(b => b.addEventListener('click', () => { activeDiv = b.getAttribute('data-div'); render(); }));
  typeBtns.forEach(b => b.addEventListener('click', () => { activeType = b.getAttribute('data-match-type'); render(); }));

  render();
}

boot().catch(e => {
  console.error(e);
  clear(listHost);
  listHost.appendChild(el('div', { class: 'muted' }, 'Բեռնումը ձախողվեց։'));
});
