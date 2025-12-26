import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { getParam } from '../core/router.js';
import { qs, clear, el } from '../core/dom.js';
import { fmtDate } from '../../../utils.js';
import {
  getTeam,
  getPlayer,
  getPlayerStats,
  getMatchesForTeam,
  getTeamsCached,
  teamsToMap
} from '../core/data.js';

import { db } from '../../../firebase.js';
import { collectionGroup, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('teams');

const teamId = getParam('team');
const playerId = getParam('id');

const header = qs('#player-header');
const statsHost = qs('#player-stats');
const backLink = qs('#back-to-team');
const matchesHost = qs('#player-matches');
const moreBtn = qs('#player-more');

let allMatches = [];
let shown = 30;

function pickNum(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) return +v;
  }
  return 0;
}

function statBox(label, value) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-v' }, String(value)),
    el('div', { class: 'stat-k muted' }, label),
  ]);
}

function toDate(m) {
  const d = new Date(`${(m?.date || '1970-01-01')}T${(m?.time || '00:00')}`);
  return isNaN(d) ? new Date(0) : d;
}

function matchRow(m, teamsMap, teamId) {
  const homeId = m.home ?? m.homeId;
  const awayId = m.away ?? m.awayId;

  const home = teamsMap[String(homeId)] || { name: m.homeName || '—' };
  const away = teamsMap[String(awayId)] || { name: m.awayName || '—' };

  const dt = toDate(m);
  const div = m._div || 'high';

  return el('a', {
    class: 'card match-row link-card',
    href: `match.html?div=${encodeURIComponent(div)}&id=${encodeURIComponent(m.id || '')}`
  }, [
    el('div', { class: 'meta' }, [
      el('span', { class: 'badge' }, String(div)),
      el('span', { class: 'muted' }, fmtDate.format(dt)),
    ]),
    el('div', { class: 'row' }, [
      el('div', { class: `side ${String(homeId) === String(teamId) ? 'highlight' : ''}` }, home.name),
      el('div', { class: 'score' }, m.score || '—'),
      el('div', { class: `side right ${String(awayId) === String(teamId) ? 'highlight' : ''}` }, away.name),
    ]),
  ]);
}

function chipText(label, value) {
  if (!value) return null;
  return el('span', { class: 'chip' }, `${label}: ${value}`);
}

function infoRow(label, value) {
  if (!value) return null;
  return el('div', { class: 'info-row' }, [
    el('div', { class: 'k' }, label),
    el('div', { class: 'v' }, String(value)),
  ]);
}

async function boot() {
  if (!header || !statsHost || !matchesHost || !backLink) return;

  if (!teamId || !playerId) {
    header.innerHTML = '<div class="muted">Missing parameters</div>';
    return;
  }

  header.innerHTML = '<div class="skeleton skeleton-title"></div>';
  statsHost.innerHTML = '<div class="skeleton skeleton-block"></div>';
  matchesHost.innerHTML = '<div class="skeleton skeleton-block"></div>';

  const [team, player, stats, matches, teams] = await Promise.all([
    getTeam(teamId),
    getPlayer(teamId, playerId),
    getPlayerStats(teamId, playerId),
    getMatchesForTeam(teamId),
    getTeamsCached(),
  ]);

  const teamsMap = teamsToMap(teams);

  backLink.href = `team.html?id=${encodeURIComponent(teamId)}`;

  // ==== HEADER: BIG PHOTO CARD + PERSONAL INFO ====
  clear(header);

  const fullName = `${player?.name || ''} ${player?.surname || ''}`.trim() || '—';
  const number = player?.number ? `#${player.number}` : null;
  const position = player?.position ? String(player.position) : null;

  // Support different schema keys (best-effort)
  const birth = player?.birthDate || player?.dob || player?.birthday || null;
  const age = player?.age || null;
  const height = player?.height || player?.heightCm || null;
  const weight = player?.weight || player?.weightKg || null;
  const foot = player?.foot || player?.preferredFoot || null;
  const city = player?.city || player?.hometown || null;
  const country = player?.country || null;
  const insta = player?.instagram || player?.insta || null;
  const phone = player?.phone || null;

  const chips = [
    number ? el('span', { class: 'chip' }, number) : null,
    position ? chipText('Դիրք', position) : null,
    age ? chipText('Տարիք', age) : null,
  ].filter(Boolean);

  const infoRows = [
    infoRow('Թիմ', team?.name || '—'),
    birth ? infoRow('Ծննդյան օր', birth) : null,
    height ? infoRow('Հասակ', String(height).includes('սմ') || String(height).includes('cm') ? height : `${height} սմ`) : null,
    weight ? infoRow('Քաշ', String(weight).includes('կգ') || String(weight).includes('kg') ? weight : `${weight} կգ`) : null,
    foot ? infoRow('Ոտք', foot) : null,
    city ? infoRow('Քաղաք', city) : null,
    country ? infoRow('Երկիր', country) : null,
    insta ? infoRow('Instagram', insta) : null,
    phone ? infoRow('Հեռ.', phone) : null,
  ].filter(Boolean);

  const photoCard = el('div', { class: 'player-photo-card' }, [
    player?.photo
      ? el('img', { src: player.photo, alt: fullName, loading: 'lazy' })
      : el('div', { class: 'player-photo-placeholder', 'aria-hidden': 'true' }, 'AMF'),
    number ? el('div', { class: 'player-badge' }, number) : null
  ].filter(Boolean));

  header.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'player-hero' }, [
      photoCard,
      el('div', { class: 'player-hero-meta' }, [
        el('h1', { class: 'page-title' }, fullName),
        chips.length
          ? el('div', { class: 'player-subline' }, chips)
          : el('div', { class: 'muted' }, team?.name || '—'),
        infoRows.length
          ? el('div', { class: 'info-grid' }, infoRows)
          : el('div', { class: 'muted', style: 'margin-top:10px;' }, 'Անձնական տվյալներ չկան։')
      ])
    ])
  ]));

  // ==== STATS (stored + live) ====
  const gamesStored = pickNum(stats, ['games','matches','played']);
  const goalsStored = pickNum(stats, ['goals','goalsCount','g']);
  const assistsStored = pickNum(stats, ['assists','ast','assistsCount']);
  const yellowStored = pickNum(stats, ['yellow','yellowCards']);
  const redStored = pickNum(stats, ['red','redCards']);

  // Live games: based on lineups
  const gamesLive = (matches || []).filter(m => {
    const lh = Array.isArray(m.lineupHome) ? m.lineupHome : (m.lineups?.home || []);
    const la = Array.isArray(m.lineupAway) ? m.lineupAway : (m.lineups?.away || []);
    return (lh || []).map(String).includes(String(playerId)) || (la || []).map(String).includes(String(playerId));
  }).length;

  let evGoals = 0, evAssists = 0, evYellow = 0, evRed = 0;

  try {
    const evSnap = await getDocs(query(collectionGroup(db, 'events'), where('playerId', '==', String(playerId))));
    evSnap.forEach(d => {
      const e = d.data();
      const t = String(e.type || '').toLowerCase();
      if (t === 'goal') evGoals++;
      else if (t === 'assist') evAssists++;
      else if (t === 'yellow') evYellow++;
      else if (t === 'red') evRed++;
    });
  } catch (e) {
    // Non-fatal: collectionGroup may be blocked by rules/index
    console.warn('events stats unavailable', e);
  }

  const useLive = (gamesLive || evGoals || evAssists || evYellow || evRed);

  const gamesShown = useLive ? (gamesLive || gamesStored) : gamesStored;
  const goalsShown = useLive ? (evGoals || goalsStored) : goalsStored;
  const assistsShown = useLive ? (evAssists || assistsStored) : assistsStored;
  const yellowShown = useLive ? (evYellow || yellowStored) : yellowStored;
  const redShown = useLive ? (evRed || redStored) : redStored;

  clear(statsHost);
  statsHost.appendChild(el('div', { class: 'stats-grid' }, [
    statBox('Խաղ', gamesShown),
    statBox('Գոլ', goalsShown),
    statBox('Ասիստ', assistsShown),
    statBox('Դեղին', yellowShown),
    statBox('Կարմիր', redShown),
  ]));

  if (useLive) {
    statsHost.appendChild(el('div', { class: 'muted', style: 'margin-top:8px;font-size:12px;' }, 'Ցուցադրված է live վիճակագրություն (կազմեր/իրադարձություններ)'));
  }

  // ==== MATCHES ====
  allMatches = (matches || []).slice().sort((a,b) => toDate(b) - toDate(a));

  function renderMatches(){
    clear(matchesHost);

    if (!allMatches.length) {
      matchesHost.appendChild(el('div', { class: 'muted' }, 'Խաղեր չկան։'));
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }

    allMatches.slice(0, shown).forEach(m => matchesHost.appendChild(matchRow(m, teamsMap, teamId)));

    if (moreBtn) moreBtn.style.display = (shown >= allMatches.length) ? 'none' : '';
  }

  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      shown += 30;
      renderMatches();
    });
  }

  renderMatches();
}

boot().catch(e => {
  console.error(e);
  if (header) header.innerHTML = '<div class="muted">Բեռնումը ձախողվեց։</div>';
});
