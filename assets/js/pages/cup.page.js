import { db } from '../../../firebase.js';
import { fmtDate, toKickoffDate } from '../../../utils.js';
import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { qs } from '../core/dom.js';

import {
  collection,
  getDocs,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('tournaments');

const scorNode = qs('#top-scorers');
const astNode = qs('#top-assists');
const grid = qs('#cup-grid');

function h(tag, cls, text){
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function parseScore(m){
  if (!m?.score || !String(m.score).includes('-')) return null;
  const [a,b] = String(m.score).split('-').map(x => parseInt(x,10));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { h:a, a:b };
}

function isFutureOrToday(m){
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  if (m.date && m.date >= todayStr) return true;
  if (m.kickoff && typeof m.kickoff.toDate === 'function'){
    const d = m.kickoff.toDate();
    const cut = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d >= cut;
  }
  return false;
}

function formatDT(m){
  try{
    const dt = toKickoffDate(m);
    if (!dt) return '';
    return fmtDate.format(dt);
  }catch{ return ''; }
}

async function loadTopStatsCup(){
  if (!scorNode || !astNode) return;

  scorNode.innerHTML = '<li class="stat-empty">Բեռնում…</li>';
  astNode.innerHTML  = '<li class="stat-empty">Բեռնում…</li>';

  try{
    const matchSnap = await getDocs(collection(db,'matches','cup','games'));
    const matchDocs = matchSnap.docs;

    if (!matchDocs.length){
      scorNode.innerHTML = '<li class="stat-empty">Գավաթի խաղեր դեռ չկան</li>';
      astNode.innerHTML  = '<li class="stat-empty">Գավաթի խաղեր դեռ չկան</li>';
      return;
    }

    const allEventsSnaps = await Promise.all(
      matchDocs.map(md => getDocs(collection(db, `matches/cup/games/${md.id}/events`)))
    );

    const goalsMap   = new Map();
    const assistsMap = new Map();

    const touch = (map, key, base, field) => {
      if (!key) return;
      const row = map.get(key) || { name: base.name, team: base.team, goals:0, assists:0 };
      row[field] += 1;
      map.set(key, row);
    };

    allEventsSnaps.forEach(snap => {
      snap.forEach(docEv => {
        const e = docEv.data() || {};
        const playerName = (e.playerName || '').trim();
        const teamName   = (e.teamName   || '').trim();
        if (!playerName) return;

        const key = `${playerName}|||${teamName || '—'}`;
        const base = { name: playerName, team: teamName || '—' };

        if (e.type === 'goal')   touch(goalsMap,   key, base, 'goals');
        if (e.type === 'assist') touch(assistsMap, key, base, 'assists');
      });
    });

    const goalsArr   = Array.from(goalsMap.values()).sort((a,b)=> b.goals-a.goals || (b.assists||0)-(a.assists||0));
    const assistsArr = Array.from(assistsMap.values()).sort((a,b)=> b.assists-a.assists || (b.goals||0)-(a.goals||0));

    const renderList = (list, node, field) => {
      node.innerHTML = '';
      if (!list.length){
        node.innerHTML = '<li class="stat-empty">Տվյալներ դեռ չկան</li>';
        return;
      }
      list.slice(0,5).forEach((p, idx) => {
        const li = h('li','stat-player');
        const left = h('div','sp-main');
        left.appendChild(h('span','sp-rank', (idx+1)+'.'));

        const text = h('div','sp-text');
        text.appendChild(h('div','sp-name', p.name || '—'));
        text.appendChild(h('div','sp-sub', (p.team && p.team !== '—') ? p.team : ''));
        left.appendChild(text);

        li.appendChild(left);
        li.appendChild(h('span','sp-value', String(p[field] || 0)));
        node.appendChild(li);
      });
    };

    renderList(goalsArr, scorNode, 'goals');
    renderList(assistsArr, astNode, 'assists');
  }catch(e){
    console.error(e);
    scorNode.innerHTML = '<li class="stat-empty">Սխալ բեռնման ընթացքում</li>';
    astNode.innerHTML  = '<li class="stat-empty">Սխալ բեռնման ընթացքում</li>';
  }
}

async function loadCupStructure(){
  if (!grid) return;
  grid.innerHTML = '<div class="skeleton skeleton-block"></div>';

  try{
    const snap = await getDocs(
      query(
        collection(db,'matches','cup','games'),
        orderBy('stage','asc'),
        orderBy('gameIndex','asc')
      )
    );
    const matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const byId = Object.fromEntries(matches.map(m=>[m.id,m]));

    function resolveFrom(ref){
      if(!ref || typeof ref !== 'string') return null;
      const m = ref.match(/^([WL]):(.+)$/);
      if(!m) return null;
      const type = m[1];
      const mid = m[2];
      const src = byId[mid];
      if(!src) return null;
      const sc = parseScore(src);
      if(!sc || !src.home || !src.away) return null;
      if(sc.h === sc.a) return null;
      const winner = sc.h > sc.a ? src.home : src.away;
      const loser  = sc.h > sc.a ? src.away : src.home;
      return (type === 'W') ? winner : loser;
    }

    const teamsSnap = await getDocs(collection(db,'teams'));
    const teamsMap = {};
    teamsSnap.forEach(ts => {
      const data = ts.data();
      teamsMap[ts.id] = { name: data.name, logo: data.logo || null };
    });

    const stagesOrder = ['1/12','1/6','1/4','1/2','final'];
    const titles = {
      '1/12': '1/12 – Նախնական փուլ',
      '1/6' : '1/6 – Քայլինգ փուլ',
      '1/4' : 'Final Four – 1/4',
      '1/2' : 'Կիսաեզրափակիչներ',
      'final': 'Ֆինալ'
    };
    const subtitles = {
      '1/12': '12 թիմ, 6 զույգ, 6 հաղթող շարժվում է առաջ',
      '1/6' : '6 թիմ, 3 զույգ, հաղթողները մտնում են Final Four',
      '1/4' : '3 հաղթող + 1 wild-card թիմ',
      '1/2' : '2 կիսաեզրափակիչ՝ ուղիղ դեպի ֆինալ',
      'final': 'Վերջին խաղ՝ գավաթի հաղթողին որոշելու համար'
    };

    grid.innerHTML = '';

    stagesOrder.forEach(stage => {
      const stageMatches = matches.filter(m => m.stage === stage);
      if (!stageMatches.length) return;

      const col = h('div','cup-column');
      col.dataset.stage = stage;

      const head = h('h3');
      head.appendChild(h('span', null, titles[stage] || stage));
      head.appendChild(h('span','stage-tag', stage === 'final' ? 'Final' : stage));
      col.appendChild(head);
      col.appendChild(h('small', null, subtitles[stage] || ''));

      stageMatches.forEach(m => {
        const card = h('a','cup-match link-card');
        card.href = `match.html?div=cup&id=${encodeURIComponent(m.id||'')}`;
        const header = h('div','cup-match-header');
        header.appendChild(h('span', null, m.label || (stage === 'final' ? 'Final' : `Խաղ ${m.gameIndex ?? ''}`)));
        const dt = formatDT(m);
        if (dt) header.appendChild(h('span', null, dt));
        card.appendChild(header);

        const teamsWrap = h('div','cup-teams');

        const homeId = m.home || resolveFrom(m.homeFrom);
        const awayId = m.away || resolveFrom(m.awayFrom);
        const homeTeamMeta = teamsMap[homeId] || {};
        const awayTeamMeta = teamsMap[awayId] || {};
        const homeLogo = m.homeLogo || homeTeamMeta.logo;
        const awayLogo = m.awayLogo || awayTeamMeta.logo;

        const parsed = parseScore(m);
        const isLiveFuture = !parsed && isFutureOrToday(m);
        const homeWinner = parsed ? parsed.h > parsed.a : false;
        const awayWinner = parsed ? parsed.a > parsed.h : false;

        const homeLine = h('div','cup-team-line');
        if (parsed){ if (homeWinner) homeLine.classList.add('winner'); else if (awayWinner) homeLine.classList.add('loser'); }
        const homeMain = h('div','cup-team-main');
        const hImg = document.createElement('img');
        hImg.className = 'team-logo';
        hImg.alt = m.homeName || homeTeamMeta.name || 'Team';
        hImg.src = homeLogo || 'https://via.placeholder.com/32?text=🛡️';
        homeMain.appendChild(hImg);
        homeMain.appendChild(h('span','cup-team-name', m.homeName || homeTeamMeta.name || '—'));
        homeLine.appendChild(homeMain);
        teamsWrap.appendChild(homeLine);

        const awayLine = h('div','cup-team-line');
        if (parsed){ if (awayWinner) awayLine.classList.add('winner'); else if (homeWinner) awayLine.classList.add('loser'); }
        const awayMain = h('div','cup-team-main');
        const aImg = document.createElement('img');
        aImg.className = 'team-logo';
        aImg.alt = m.awayName || awayTeamMeta.name || 'Team';
        aImg.src = awayLogo || 'https://via.placeholder.com/32?text=🛡️';
        awayMain.appendChild(aImg);
        awayMain.appendChild(h('span','cup-team-name', m.awayName || awayTeamMeta.name || '—'));
        awayLine.appendChild(awayMain);
        teamsWrap.appendChild(awayLine);

        card.appendChild(teamsWrap);

        const scoreText = parsed ? `${parsed.h} : ${parsed.a}` : (m.score || (isLiveFuture ? '— : —' : '-'));
        const score = h('div','cup-score', scoreText);
        card.appendChild(score);

        col.appendChild(card);
      });

      grid.appendChild(col);
    });

    if (!grid.children.length){
      grid.appendChild(h('div','muted','Տվյալներ չկան։'));
    }
  }catch(e){
    console.error(e);
    grid.innerHTML = '<div class="muted">Չհաջողվեց բեռնել գավաթի բրաκέտը։</div>';
  }
}

async function boot(){
  await Promise.all([loadCupStructure(), loadTopStatsCup()]);
}

boot().catch(e => console.error(e));
