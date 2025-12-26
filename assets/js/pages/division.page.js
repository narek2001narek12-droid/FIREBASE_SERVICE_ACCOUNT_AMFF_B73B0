import { db } from '../../../firebase.js';
import { fmtDate, toKickoffDate } from '../../../utils.js';
import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { qs, clear, el } from '../core/dom.js';
import { getTeamsCached, teamsToMap } from '../core/data.js';

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('tournaments');

const DIV = document.body?.dataset?.div || 'high';

const standingsHost = qs('#table-standings');
const scorHost = qs('#scorer-list');
const astHost = qs('#assist-list');
const yelHost = qs('#yellow-list');
const redHost = qs('#red-list');
const recentHost = qs('#recent-list');
const upcomingHost = qs('#upcoming-list');

function parseScore(m){
  if (!m?.score || !String(m.score).includes('-')) return null;
  const [a,b] = String(m.score).split('-').map(x => parseInt(x,10));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { h:a, a:b };
}

function divLabel(div){
  switch(div){
    case 'high': return 'Բարձրագույն';
    case 'first': return 'Առաջին';
    case 'cup': return 'Գավաթ';
    case 'supercup': return 'Supercup';
    default: return div;
  }
}

function matchCard(m, teamsMap){
  const homeId = m.home ?? m.homeId;
  const awayId = m.away ?? m.awayId;
  const home = teamsMap[homeId] || { name: m.homeName || '—', logo: m.homeLogo || '' };
  const away = teamsMap[awayId] || { name: m.awayName || '—', logo: m.awayLogo || '' };
  const dt = toKickoffDate(m);

  return el('a', { class: 'card match-card link-card', href: `match.html?div=${encodeURIComponent(DIV)}&id=${encodeURIComponent(m.id||'')}` }, [
    el('div', { class: 'meta' }, [
      el('span', { class: 'badge' }, divLabel(DIV)),
      el('span', { class: 'muted' }, fmtDate.format(dt)),
    ]),
    el('div', { class: 'row' }, [
      el('div', { class: 'team side' }, [
        home.logo ? el('img', { class:'logo-sm', src: home.logo, alt: home.name, loading:'lazy' }) : el('div', { class:'logo-sm placeholder' }, 'A'),
        el('span', { class:'name' }, home.name),
      ]),
      el('div', { class:'score' }, m.score || '—'),
      el('div', { class: 'team side right' }, [
        el('span', { class:'name' }, away.name),
        away.logo ? el('img', { class:'logo-sm', src: away.logo, alt: away.name, loading:'lazy' }) : el('div', { class:'logo-sm placeholder' }, 'A'),
      ]),
    ])
  ]);
}

/* Standings with group tie-breaker (head-to-head mini table) */
async function renderStandings(){
  if (!standingsHost) return;
  clear(standingsHost);

  const teamsSnap = await getDocs(query(collection(db,'teams'), where('division','==', DIV)));
  const stats = {};
  teamsSnap.forEach(d => {
    const t = d.data();
    stats[d.id] = { id:d.id, name:t.name||'—', logo:t.logo||'', played:0, win:0, draw:0, loss:0, gf:0, ga:0, pts:0 };
  });

  const matchesSnap = await getDocs(collection(db, `matches/${DIV}/games`));
  const results = [];
  matchesSnap.forEach(d => {
    const m = d.data();
    const s = parseScore(m);
    if (!s) return;

    const homeId = m.home ?? m.homeId;
    const awayId = m.away ?? m.awayId;
    const A = stats[homeId], B = stats[awayId];
    if (!A || !B) return;

    A.played++; B.played++;
    A.gf += s.h; A.ga += s.a;
    B.gf += s.a; B.ga += s.h;

    if (s.h > s.a){ A.win++; B.loss++; A.pts += 3; }
    else if (s.a > s.h){ B.win++; A.loss++; B.pts += 3; }
    else { A.draw++; B.draw++; A.pts += 1; B.pts += 1; }

    results.push({home:homeId, away:awayId, g1:s.h, g2:s.a});
  });

  let table = Object.values(stats).sort((a,b)=> b.pts - a.pts);

  function applyGroupTieBreak(arr){
    let i=0; const out=[];
    while(i < arr.length){
      const start=i; const pts=arr[i].pts;
      while(i < arr.length && arr[i].pts===pts) i++;
      const end=i;

      if (end-start===1){ out.push(arr[start]); continue; }

      const group = arr.slice(start,end);
      const groupIds = new Set(group.map(t => t.id));
      const mini = {};
      group.forEach(t => mini[t.id] = {
        id:t.id, pts:0, gf:0, ga:0,
        gdAll:(t.gf - t.ga), gfAll:t.gf,
        name:t.name, logo:t.logo,
      });

      results.forEach(r => {
        if (!groupIds.has(r.home) || !groupIds.has(r.away)) return;
        if (r.g1 > r.g2) mini[r.home].pts += 3;
        else if (r.g2 > r.g1) mini[r.away].pts += 3;
        else { mini[r.home].pts += 1; mini[r.away].pts += 1; }
        mini[r.home].gf += r.g1; mini[r.home].ga += r.g2;
        mini[r.away].gf += r.g2; mini[r.away].ga += r.g1;
      });

      const seg = group.slice().sort((A,B) => {
        const a = mini[A.id], b = mini[B.id];
        if (a.pts !== b.pts) return b.pts - a.pts;
        const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
        if (gdA !== gdB) return gdB - gdA;
        if (a.gf !== b.gf) return b.gf - a.gf;
        if (a.gdAll !== b.gdAll) return b.gdAll - a.gdAll;
        if (a.gfAll !== b.gfAll) return b.gfAll - a.gfAll;
        return (A.name||'').localeCompare(B.name||'');
      });

      out.push(...seg);
    }
    return out;
  }

  table = applyGroupTieBreak(table).sort((a,b) =>
    b.pts - a.pts ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    (a.name||'').localeCompare(b.name||'')
  );

  // render table
  const wrapper = el('div', { class:'table-wrapper' });
  const tbl = document.createElement('table');
  tbl.innerHTML = `
    <thead>
      <tr>
        <th>#</th><th>Թիմ</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Pts</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tb = tbl.querySelector('tbody');

  table.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${idx+1}</b></td>
      <td>${r.logo ? `<img src="${r.logo}" alt="${r.name}" loading="lazy" />` : ''}${r.name}</td>
      <td>${r.played}</td>
      <td>${r.win}</td>
      <td>${r.draw}</td>
      <td>${r.loss}</td>
      <td>${r.gf}</td>
      <td>${r.ga}</td>
      <td><b>${r.pts}</b></td>`;
    tb.appendChild(tr);
  });

  wrapper.appendChild(tbl);
  standingsHost.appendChild(wrapper);
}

function renderLeader(host, arr, field){
  if (!host) return;
  clear(host);

  const medals = ['🥇','🥈','🥉'];
  const sorted = [...(arr||[])].sort((a,b)=>(b[field]||0)-(a[field]||0)).slice(0,8);

  if (!sorted.length){
    host.appendChild(el('div', { class:'muted' }, 'Տվյալներ չկան։'));
    return;
  }

  sorted.forEach((p, idx) => {
    const left = el('div', { class:'sp-main' }, [
      el('span', { class:'sp-rank' }, medals[idx] || String(idx+1)),
      el('div', { class:'sp-text' }, [
        el('div', { class:'sp-name' }, p.name || '—'),
        el('div', { class:'sp-sub' }, p.team || ''),
      ]),
    ]);

    const right = el('span', { class:'sp-value' }, String(p[field] ?? 0));
    host.appendChild(el('div', { class:'stat-player' }, [left, right]));
  });
}

async function loadTopList(type, hostId, field){
  const host = qs(`#${hostId}`);
  if (!host) return;

  try{
    // Firestore path: topStats/{DIV}/{type}
    const snap = await getDocs(collection(db, 'topStats', DIV, type));
    const list = snap.docs.map(d => d.data());
    renderLeader(host, list, field);
  }catch(e){
    console.error(e);
    clear(host);
    host.appendChild(el('div', { class:'muted' }, 'Տվյալները հասանելի չեն։'));
  }
}

async function renderLeaders(){
  await Promise.all([
    loadTopList('scorers','scorer-list','goals'),
    loadTopList('assists','assist-list','assists'),
    loadTopList('yellow','yellow-list','yellow'),
    loadTopList('red','red-list','red'),
  ]);
}

async function renderMatches(){
  if (!recentHost || !upcomingHost) return;

  recentHost.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
  upcomingHost.innerHTML = '<div class="skeleton skeleton-card"></div>';

  const [teams, snap] = await Promise.all([
    getTeamsCached(),
    getDocs(query(collection(db, `matches/${DIV}/games`), orderBy('date','desc'), limit(120))),
  ]);
  const map = teamsToMap(teams);
  const matches = snap.docs.map(d => ({ id:d.id, ...d.data() }));

  const now = new Date();
  const past = [];
  const future = [];

  matches.forEach(m => {
    const dt = toKickoffDate(m);
    if (dt < now) past.push(m);
    else future.push(m);
  });

  past.sort((a,b)=> toKickoffDate(b) - toKickoffDate(a));
  future.sort((a,b)=> toKickoffDate(a) - toKickoffDate(b));

  clear(recentHost);
  clear(upcomingHost);

  (past.slice(0, 10)).forEach(m => recentHost.appendChild(matchCard(m, map)));
  if (!past.length) recentHost.appendChild(el('div', { class:'muted' }, 'Տվյալներ չկան։'));

  (future.slice(0, 10)).forEach(m => upcomingHost.appendChild(matchCard(m, map)));
  if (!future.length) upcomingHost.appendChild(el('div', { class:'muted' }, 'Տվյալներ չկան։'));
}

async function boot(){
  await Promise.all([renderStandings(), renderLeaders(), renderMatches()]);
}

boot().catch(e => {
  console.error(e);
  if (standingsHost){
    clear(standingsHost);
    standingsHost.appendChild(el('div', { class:'muted' }, 'Բեռնումը ձախողվեց։'));
  }
});
