import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { getParam } from '../core/router.js';
import { qs, clear, el } from '../core/dom.js';
import { fmtDate } from '../../../utils.js';
import {
  getTeam,
  getRosterPlayers,
  getMatchesForTeam,
  getTeamsCached,
  teamsToMap
} from '../core/data.js';

import { db } from '../../../firebase.js';
import {
  collectionGroup,
  getDocs,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('teams');

const teamId = getParam('id');

const header = qs('#team-header');
const rosterHost = qs('#roster');
const matchesHost = qs('#team-matches');
const statsHost = qs('#team-stats');
const leadersHost = qs('#team-leaders');     // ✅ только ОДИН раз
const filtersHost = qs('#team-match-filters');
const moreBtn = qs('#team-more');

let allMatches = [];
let shown = 30;
let activeDiv = 'all';

let teamEvents = null; // leaders events (best-effort)

function toDate(m) {
  const d = new Date(`${(m?.date || '1970-01-01')}T${(m?.time || '00:00')}`);
  return isNaN(d) ? new Date(0) : d;
}

function computeTeamStats(matches, teamId) {
  const out = { played:0, win:0, draw:0, loss:0, gf:0, ga:0, pts:0 };

  matches.forEach(m => {
    if (!m?.score || !String(m.score).includes('-')) return;

    const [a,b] = String(m.score).split('-').map(x => parseInt(x,10));
    if (isNaN(a) || isNaN(b)) return;

    const homeId = m.home ?? m.homeId;
    const awayId = m.away ?? m.awayId;
    const isHome = String(homeId) === String(teamId);

    const gf = isHome ? a : b;
    const ga = isHome ? b : a;

    out.played++;
    out.gf += gf; out.ga += ga;

    if (gf > ga) { out.win++; out.pts += 3; }
    else if (gf < ga) { out.loss++; }
    else { out.draw++; out.pts += 1; }
  });

  return out;
}

function statBox(label, value) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-v' }, String(value)),
    el('div', { class: 'stat-k muted' }, label),
  ]);
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
      el('div', { class: `side ${String(homeId)===String(teamId) ? 'highlight' : ''}` }, home.name),
      el('div', { class: 'score' }, m.score || '—'),
      el('div', { class: `side right ${String(awayId)===String(teamId) ? 'highlight' : ''}` }, away.name),
    ]),
  ]);
}

function divLabel(div){
  switch(div){
    case 'high': return 'High';
    case 'first': return 'First';
    case 'cup': return 'Cup';
    case 'supercup': return 'Supercup';
    case 'structure': return '24';
    default: return String(div||'');
  }
}

function buildLeaderList(items){
  if (!items.length) return el('div', { class:'muted' }, '—');

  const list = el('div', { class:'leaders-list' });
  items.forEach(it => {
    const name = it.playerName || it.playerId || '—';

    const right = el('span', { class:'badge' }, String(it.count));
    const left = el('span', { class:'leaders-name' }, name);

    const row = it.playerId
      ? el('a', {
          class:'leaders-item',
          href:`player.html?team=${encodeURIComponent(teamId)}&id=${encodeURIComponent(it.playerId)}`
        }, [left, right])
      : el('div', { class:'leaders-item' }, [left, right]);

    list.appendChild(row);
  });

  return list;
}

function computeLeaders(events, divFilter){
  const filtered = (divFilter && divFilter !== 'all')
    ? events.filter(e => String(e.div || '') === String(divFilter))
    : events;

  const byType = (type) => {
    const map = new Map();

    filtered
      .filter(e => String(e.type||'') === type)
      .forEach(e => {
        const key = String(e.playerId || e.playerName || '—');
        const prev = map.get(key) || { playerId: e.playerId || null, playerName: e.playerName || key, count: 0 };
        prev.count += 1;
        map.set(key, prev);
      });

    return Array.from(map.values()).sort((a,b)=> b.count - a.count).slice(0, 8);
  };

  return {
    goals: byType('goal'),
    assists: byType('assist'),
    yellows: byType('yellow'),
    reds: byType('red'),
  };
}

async function loadTeamEvents(teamId){
  try {
    const qy = query(collectionGroup(db, 'events'), where('teamId', '==', String(teamId)));
    const snap = await getDocs(qy);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('team events load failed', e);
    return null;
  }
}

function renderFilters(divs){
  if (!filtersHost) return;

  clear(filtersHost);
  const unique = ['all', ...divs];

  unique.forEach(d => {
    const b = el('button', {
      class: `segbtn ${activeDiv===d ? 'active' : ''}`,
      type:'button'
    }, d==='all' ? 'Բոլորը' : divLabel(d));

    b.addEventListener('click', () => {
      activeDiv = d;
      shown = 30;

      [...filtersHost.children].forEach(x => x.classList.remove('active'));
      b.classList.add('active');

      if (moreBtn) moreBtn.style.display = '';
      if (window.__teamRerender) window.__teamRerender();
    });

    filtersHost.appendChild(b);
  });
}

function filterMatches(){
  return activeDiv==='all'
    ? allMatches
    : allMatches.filter(m => String(m._div||'') === String(activeDiv));
}

async function boot() {
  // базовые защиты, чтобы не падать, если нет блока на странице
  if (!header || !rosterHost || !matchesHost || !statsHost) return;

  if (!teamId) {
    header.innerHTML = '<div class="muted">Team id missing</div>';
    return;
  }

  header.innerHTML = '<div class="skeleton skeleton-title"></div>';
  rosterHost.innerHTML = '<div class="skeleton skeleton-block"></div>';
  matchesHost.innerHTML = '<div class="skeleton skeleton-block"></div>';

  const [team, players, matches, teams] = await Promise.all([
    getTeam(teamId),
    getRosterPlayers(teamId),
    getMatchesForTeam(teamId),
    getTeamsCached(),
  ]);

  // events for leaders (best-effort)
  if (leadersHost) {
    leadersHost.innerHTML = '<div class="skeleton skeleton-block"></div>';
    teamEvents = await loadTeamEvents(teamId);
  }

  const teamsMap = teamsToMap(teams);

  // header
  clear(header);
  header.appendChild(el('div', { class: 'team-hero' }, [
    team?.logo
      ? el('img', { class: 'logo-xl', src: team.logo, alt: team.name || 'logo', loading: 'lazy' })
      : el('div', { class: 'logo-xl placeholder' }, 'AMF'),
    el('div', { class: 'team-hero-meta' }, [
      el('h1', { class: 'page-title' }, team?.name || '—'),
      el('div', { class: 'muted' }, (team?.division === 'first') ? 'Առաջին Դիվիզիոն' : 'Բարձրագույն Դիվիզիոն'),
    ])
  ]));

  // roster
  clear(rosterHost);
  if (!players.length) {
    rosterHost.appendChild(el('div', { class: 'muted' }, 'Խաղացողներ չկան։'));
  } else {
    const list = el('div', { class: 'list' });

    players.forEach(p => {
      const name = `${p.name||''} ${p.surname||''}`.trim() || '—';

      list.appendChild(el('a', {
        class: 'list-item',
        href: `player.html?team=${encodeURIComponent(teamId)}&id=${encodeURIComponent(p.id)}`
      }, [
        p.photo
          ? el('img', { class: 'avatar', src: p.photo, alt: name, loading: 'lazy' })
          : el('div', { class: 'avatar placeholder' }, 'P'),
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, name),
          el('div', { class: 'muted' }, [
            p.number ? `#${p.number} ` : '',
            p.position ? String(p.position) : '',
          ].join('').trim()),
        ]),
        el('div', { class: 'chev', 'aria-hidden': 'true' }, '›')
      ]));
    });

    rosterHost.appendChild(list);
  }

  // matches + stats + filters
  allMatches = (matches || []).slice().sort((a,b)=> toDate(b) - toDate(a));
  const divs = Array.from(new Set(allMatches.map(m => m._div).filter(Boolean)));
  renderFilters(divs);

  function render(){
    const list = filterMatches();

    const stats = computeTeamStats(list, teamId);
    clear(statsHost);
    statsHost.appendChild(el('div', { class: 'stats-grid' }, [
      statBox('Խաղ', stats.played),
      statBox('Հաղ', stats.win),
      statBox('Ոչ ոք', stats.draw),
      statBox('Պարտ', stats.loss),
      statBox('Գոլ', `${stats.gf}-${stats.ga}`),
      statBox('Pts', stats.pts),
    ]));

    // leaders
    if (leadersHost) {
      clear(leadersHost);

      if (!teamEvents) {
        leadersHost.appendChild(el('div', { class:'muted' }, 'Առաջատարները հասանելի չեն (իրավունքներ կամ index)։'));
      } else {
        const leaders = computeLeaders(teamEvents, activeDiv);

        leadersHost.appendChild(el('div', { class:'card leaders-card' }, [
          el('div', { class:'leaders-title' }, 'Գոլեր'),
          buildLeaderList(leaders.goals),
        ]));
        leadersHost.appendChild(el('div', { class:'card leaders-card' }, [
          el('div', { class:'leaders-title' }, 'Ասիստներ'),
          buildLeaderList(leaders.assists),
        ]));
        leadersHost.appendChild(el('div', { class:'card leaders-card' }, [
          el('div', { class:'leaders-title' }, 'Դեղին'),
          buildLeaderList(leaders.yellows),
        ]));
        leadersHost.appendChild(el('div', { class:'card leaders-card' }, [
          el('div', { class:'leaders-title' }, 'Կարմիր'),
          buildLeaderList(leaders.reds),
        ]));
      }
    }

    clear(matchesHost);

    if (!list.length) {
      matchesHost.appendChild(el('div', { class: 'muted' }, 'Խաղեր չկան։'));
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }

    list.slice(0, shown).forEach(m => matchesHost.appendChild(matchRow(m, teamsMap, teamId)));

    if (moreBtn) {
      moreBtn.style.display = (shown >= list.length) ? 'none' : '';
    }
  }

  window.__teamRerender = render;

  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      shown += 30;
      render();
    });
  }

  render();
}

boot().catch(e => {
  console.error(e);
  if (header) header.innerHTML = '<div class="muted">Բեռնումը ձախողվեց։</div>';
});
