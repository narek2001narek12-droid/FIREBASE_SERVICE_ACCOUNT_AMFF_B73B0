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
  where,
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('tournaments');

const tabBtns = qsa('[data-stab]');
const host = qs('#structure-content');

let activeTab = 'table';
let teamsMap = {};
let participants = [];
let matches = [];
let byId = {};

function toDate(m){
  const d = new Date(`${(m.date||'1970-01-01')}T${(m.time||'00:00')}`);
  return isNaN(d) ? new Date(0) : d;
}

function parseScore(score){
  if (!score || !String(score).includes('-')) return null;
  const [a,b] = String(score).split('-').map(x => parseInt(x,10));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { h:a, a:b };
}

function resolveTeam(ref){
  if (!ref) return null;
  return teamsMap[ref] || null;
}

function getWinnerLoser(match){
  const sc = parseScore(match?.score);
  if (!sc) return { winner:null, loser:null };
  const home = match.home;
  const away = match.away;
  if (!home || !away) return { winner:null, loser:null };
  if (sc.h === sc.a) return { winner:null, loser:null };
  return (sc.h > sc.a)
    ? { winner: home, loser: away }
    : { winner: away, loser: home };
}

function resolveFromToken(token){
  // W:<matchId> or L:<matchId>
  if (!token || typeof token !== 'string') return null;
  const [k, mid] = token.split(':');
  if (!mid) return null;
  const m = byId[mid];
  if (!m) return null;
  const r = getWinnerLoser(m);
  if (k === 'W') return r.winner;
  if (k === 'L') return r.loser;
  return null;
}

function matchTeams(match){
  const homeId = match.home || resolveFromToken(match.homeFrom);
  const awayId = match.away || resolveFromToken(match.awayFrom);
  const home = resolveTeam(homeId) || { name: match.homeName || '—', logo: match.homeLogo || null };
  const away = resolveTeam(awayId) || { name: match.awayName || '—', logo: match.awayLogo || null };
  return { homeId, awayId, home, away };
}

function badgeStage(s){
  const map = {
    league: 'League',
    playin: 'Play-in',
    r16: '1/8',
    qf: '1/4',
    sf: '1/2',
    final: 'Final',
    sc_qf: 'Small 1/4',
    sc_sf: 'Small 1/2',
    sc_final: 'Small Final',
  };
  return map[s] || String(s||'');
}

function renderTable(){
  clear(host);

  const tableMatches = matches.filter(m => (m.stage || 'league') === 'league');
  if (!participants.length) {
    host.appendChild(el('div', { class: 'empty' }, 'Structure մրցաշարի թիմեր նշված չեն (teams.tournaments → structure)։'));
    return;
  }
  if (!tableMatches.length) {
    host.appendChild(el('div', { class: 'empty' }, 'Լիգայի հանդիպումներ դեռ չկան։ Գեներացիան արեք ադմինից։'));
    return;
  }

  const stats = {};
  participants.forEach(t => {
    stats[t.id] = { id:t.id, name:t.name||'—', logo:t.logo||null, p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 };
  });

  tableMatches.forEach(m => {
    const sc = parseScore(m.score);
    if (!sc) return;
    const home = m.home;
    const away = m.away;
    if (!stats[home] || !stats[away]) return;
    const H = stats[home];
    const A = stats[away];
    H.p++; A.p++;
    H.gf += sc.h; H.ga += sc.a;
    A.gf += sc.a; A.ga += sc.h;
    if (sc.h > sc.a){ H.w++; A.l++; H.pts += 3; }
    else if (sc.h < sc.a){ A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts += 1; A.pts += 1; }
  });

  const rows = Object.values(stats).sort((a,b)=>
    (b.pts-a.pts) || ((b.gf-b.ga)-(a.gf-a.ga)) || (b.gf-a.gf) || a.name.localeCompare(b.name)
  );

  const wrap = el('div', { class: 'table-wrapper' });
  const t = el('table');
  t.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Թիմ</th>
        <th>Խ</th>
        <th>Հ</th>
        <th>Ո</th>
        <th>Պ</th>
        <th>Գ</th>
        <th>Pts</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = t.querySelector('tbody');
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const gd = `${r.gf}-${r.ga}`;
    const logo = r.logo ? `<img src="${r.logo}" alt="" loading="lazy" />` : '';
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${logo}${r.name}</td>
      <td>${r.p}</td>
      <td>${r.w}</td>
      <td>${r.d}</td>
      <td>${r.l}</td>
      <td>${gd}</td>
      <td><b>${r.pts}</b></td>
    `;
    tb.appendChild(tr);
  });
  wrap.appendChild(t);
  host.appendChild(wrap);
}

function renderLeague(){
  clear(host);
  const list = matches.filter(m => (m.stage || 'league') === 'league');
  if (!list.length) {
    host.appendChild(el('div', { class: 'empty' }, 'Լիգայի հանդիպումներ դեռ չկան։'));
    return;
  }

  const byRound = {};
  list.forEach(m => {
    const r = Number(m.round || 0) || 0;
    const k = r ? `Round ${r}` : 'Matches';
    (byRound[k] ||= []).push(m);
  });

  Object.keys(byRound).sort((a,b)=>{
    const na = parseInt(a.replace(/\D+/g,''),10) || 0;
    const nb = parseInt(b.replace(/\D+/g,''),10) || 0;
    return na - nb;
  }).forEach(k => {
    host.appendChild(el('div', { class: 'section-head' }, [
      el('h2', { class: 'section-title' }, k),
    ]));
    const stack = el('div', { class: 'stack' });
    byRound[k].sort((a,b)=> toDate(a) - toDate(b)).forEach(m => stack.appendChild(matchCard(m)));
    host.appendChild(stack);
  });
}

function matchCard(m){
  const { homeId, awayId, home, away } = matchTeams(m);
  const dt = toDate(m);
  const stage = m.stage || 'league';
  const sc = parseScore(m.score);
  const homeWin = sc && sc.h > sc.a;
  const awayWin = sc && sc.a > sc.h;

  return el('a', { class: 'card match-row link-card', href: `match.html?div=${encodeURIComponent('structure')}&id=${encodeURIComponent(m.id||'')}` }, [
    el('div', { class: 'meta' }, [
      el('span', { class: 'badge' }, badgeStage(stage)),
      el('span', { class: 'muted' }, m.date ? fmtDate.format(dt) : ''),
    ]),
    el('div', { class: 'row' }, [
      el('div', { class: `side ${homeWin ? 'winner' : awayWin ? 'loser' : ''}` }, home.name || '—'),
      el('div', { class: 'score' }, m.score || '—'),
      el('div', { class: `side right ${awayWin ? 'winner' : homeWin ? 'loser' : ''}` }, away.name || '—'),
    ]),
  ]);
}

function renderBracket(kind){
  // kind: 'playoff' or 'small'
  clear(host);
  const stages = (kind === 'small')
    ? ['sc_qf','sc_sf','sc_final']
    : ['playin','r16','qf','sf','final'];

  const has = matches.some(m => stages.includes(m.stage));
  if (!has) {
    host.appendChild(el('div', { class: 'empty' }, 'Այս փուլերի խաղեր դեռ չկան։ (Գեներացրեք ադմինից)'));
    return;
  }

  const grid = el('div', { class: 'bracket' });
  stages.forEach(st => {
    const list = matches.filter(m => m.stage === st).sort((a,b)=> (a.gameIndex||0) - (b.gameIndex||0));
    if (!list.length) return;
    const col = el('div', { class: 'bracket-column' }, [
      el('h3', {}, [
        el('span', {}, badgeStage(st)),
        el('span', { class: 'stage-tag' }, badgeStage(st)),
      ]),
    ]);
    list.forEach(m => {
      const card = el('div', { class: 'bracket-match' });
      card.appendChild(el('div', { class: 'cup-match-header' }, [
        el('span', {}, m.label || (m.gameIndex ? `Խաղ ${m.gameIndex}` : badgeStage(st))),
        el('span', {}, m.date ? fmtDate.format(toDate(m)) : ''),
      ]));

      const teamsWrap = el('div', { class: 'cup-teams' });
      const { homeId, awayId, home, away } = matchTeams(m);
      const sc = parseScore(m.score);
      const homeWin = sc && sc.h > sc.a;
      const awayWin = sc && sc.a > sc.h;

      const homeLine = el('div', { class: `cup-team-line ${homeWin ? 'winner' : awayWin ? 'loser' : ''}` }, [
        el('div', { class: 'cup-team-main' }, [
          el('img', { class: 'team-logo', src: home.logo || 'https://via.placeholder.com/32?text=🛡️', alt: home.name || '—', loading: 'lazy' }),
          el('span', { class: 'cup-team-name' }, home.name || '—'),
        ]),
      ]);
      const awayLine = el('div', { class: `cup-team-line ${awayWin ? 'winner' : homeWin ? 'loser' : ''}` }, [
        el('div', { class: 'cup-team-main' }, [
          el('img', { class: 'team-logo', src: away.logo || 'https://via.placeholder.com/32?text=🛡️', alt: away.name || '—', loading: 'lazy' }),
          el('span', { class: 'cup-team-name' }, away.name || '—'),
        ]),
      ]);
      teamsWrap.appendChild(homeLine);
      teamsWrap.appendChild(awayLine);
      card.appendChild(teamsWrap);
      card.appendChild(el('div', { class: 'bracket-score' }, m.score || '—'));
      col.appendChild(card);
    });
    grid.appendChild(col);
  });

  host.appendChild(grid);
}

function renderRules(){
  clear(host);
  host.appendChild(el('div', { class: 'card' }, [
    el('h2', { class: 'section-title' }, 'Կառուցվածքը'),
    el('ol', { class: 'list-plain' }, [
      el('li', {}, el('b', {}, '24 թիմ — մեկ միասնական աղյուսակ')),
      el('li', {}, el('b', {}, '10 խաղ (10 տուր) յուրաքանչյուր թիմի համար')),
      el('li', {}, ['Աղյուսակից ', el('b', {}, '1–8'), ' տեղերը անմիջապես անցնում են ', el('b', {}, '1/8 եզրափակիչ')]),
      el('li', {}, ['Աղյուսակից ', el('b', {}, '9–24'), ' տեղերը խաղում են ', el('b', {}, 'մեկ փլեյ-օֆֆ խաղ')]),
      el('li', {}, ['Փլեյ-օֆֆի ', el('b', {}, 'հաղթողները'), ' գնում են 1/8, ', el('b', {}, 'պարտվողները'), '՝ Փոքր Գավաթ']),
    ]),
    el('div', { class: 'muted' }, 'Գեներացիան/սիդինգը կատարվում է ադմին էջից։')
  ]));
}

function setTab(t){
  activeTab = t;
  tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-stab') === t));
  render();
}

function render(){
  if (!host) return;
  if (activeTab === 'table') return renderTable();
  if (activeTab === 'league') return renderLeague();
  if (activeTab === 'playoff') return renderBracket('playoff');
  if (activeTab === 'small') return renderBracket('small');
  return renderRules();
}

async function load(){
  if (!host) return;
  host.innerHTML = '<div class="skeleton skeleton-block"></div>';

  const teams = await getTeamsCached();
  teamsMap = teamsToMap(teams);

  // participants: teams.tournaments contains 'structure'
  try{
    const pSnap = await getDocs(query(collection(db,'teams'), where('tournaments','array-contains','structure')));
    participants = pSnap.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  }catch{
    participants = [];
  }

  try{
    const mSnap = await getDocs(query(collection(db,'matches','structure','games'), orderBy('stage','asc'), orderBy('round','asc'), orderBy('gameIndex','asc')));
    matches = mSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  }catch{
    matches = [];
  }

  byId = {};
  matches.forEach(m => { byId[m.id] = m; });

  render();
}

function boot(){
  tabBtns.forEach(b => b.addEventListener('click', () => setTab(b.getAttribute('data-stab'))));
  // default
  setTab('table');
  load().catch(e => {
    console.error(e);
    if (host) host.innerHTML = '<div class="error">Չհաջողվեց բեռնել տվյալները։</div>';
  });
}

boot();
