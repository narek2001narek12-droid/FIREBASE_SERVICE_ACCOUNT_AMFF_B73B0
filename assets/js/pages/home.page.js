import { db } from '../../../firebase.js';
import { fmtDate } from '../../../utils.js';
import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { el, clear, qs } from '../core/dom.js';
import { getTeamsCached, teamsToMap } from '../core/data.js';
import { getSiteConfig } from '../core/config.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('home');

// Public social links (configurable via localStorage).
{
  const cfg = getSiteConfig();
  const ig = document.getElementById('ig-link');
  const tg = document.getElementById('tg-link');
  if (ig && cfg.instagramUrl) ig.href = cfg.instagramUrl;
  if (tg && cfg.telegramUrl) tg.href = cfg.telegramUrl;
}

const recentHost = qs('#recent-matches');

function toDate(m) {
  const d = new Date(`${(m.date||'1970-01-01')}T${(m.time||'00:00')}`);
  return isNaN(d) ? new Date(0) : d;
}

function divLabel(div) {
  switch (div) {
    case 'high': return 'ԲԱՐՁՐԱԳՈՒՅՆ';
    case 'first': return 'ԱՌԱՋԻՆ';
    case 'cup': return 'AMF ԳԱՎԱԹ';
    case 'supercup': return 'AMF ՍՈՒՊԵՐԳԱՎԱԹ';
    default: return String(div||'');
  }
}

function renderEmpty(msg) {
  clear(recentHost);
  recentHost.appendChild(el('div', { class: 'muted' }, msg));
}

function matchCard(m, teams) {
  const homeId = m.home ?? m.homeId;
  const awayId = m.away ?? m.awayId;
  const home = teams[homeId] || { name: m.homeName || '—', logo: '' };
  const away = teams[awayId] || { name: m.awayName || '—', logo: '' };
  const dt = toDate(m);

  const left = el('div', { class: 'team side' }, [
    home.logo ? el('img', { class: 'logo-sm', src: home.logo, alt: home.name, loading: 'lazy' }) : '',
    el('span', { class: 'name' }, home.name),
  ]);
  const right = el('div', { class: 'team side right' }, [
    el('span', { class: 'name' }, away.name),
    away.logo ? el('img', { class: 'logo-sm', src: away.logo, alt: away.name, loading: 'lazy' }) : '',
  ]);

  const top = el('div', { class: 'meta' }, [
    el('span', { class: 'badge' }, divLabel(m._div)),
    el('span', { class: 'muted' }, fmtDate.format(dt)),
  ]);

  return el('a', { class: 'card match-card link-card', href: `match.html?div=${encodeURIComponent(m._div||'high')}&id=${encodeURIComponent(m.id||'')}` }, [
    top,
    el('div', { class: 'row' }, [
      left,
      el('div', { class: 'score' }, m.score || '—'),
      right,
    ]),
  ]);
}

async function loadRecentMatches() {
  recentHost.innerHTML = "<div class=\"skeleton skeleton-card\"></div>" + "<div class=\"skeleton skeleton-card\"></div>" + "<div class=\"skeleton skeleton-card\"></div>";

  const [teams, snaps] = await Promise.all([
    getTeamsCached(),
    Promise.all([
      getDocs(query(collection(db, 'matches/high/games'), orderBy('date', 'desc'), limit(8))),
      getDocs(query(collection(db, 'matches/first/games'), orderBy('date', 'desc'), limit(8))),
      getDocs(query(collection(db, 'matches/cup/games'), orderBy('date', 'desc'), limit(8))),
      getDocs(query(collection(db, 'matches/supercup/games'), orderBy('date', 'desc'), limit(8))),
    ]),
  ]);

  const map = teamsToMap(teams);
  let all = [];
  const [h,f,c,s] = snaps;
  [h,f,c,s].forEach((snap, idx) => {
    const div = ['high','first','cup','supercup'][idx];
    snap.docs.forEach(d => {
      const m = d.data();
      if (!m?.score || !String(m.score).includes('-')) return;
      all.push({ id: d.id, _div: div, ...m });
    });
  });

  all.sort((a,b) => toDate(b) - toDate(a));
  all = all.slice(0, 6);

  if (!all.length) return renderEmpty('Դեռ արդյունքներ չկան։');

  clear(recentHost);
  all.forEach(m => recentHost.appendChild(matchCard(m, map)));
}

loadRecentMatches().catch(err => {
  console.error(err);
  renderEmpty('Բեռնումը ձախողվեց։');
});
