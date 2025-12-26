import { bindThemeButton } from '../core/theme.js';
import { initTabbarActive } from '../core/tabbar.js';
import { qs, clear, el } from '../core/dom.js';
import { getParam } from '../core/router.js';
import { getTeamsCached, teamsToMap, getRosterPlayers } from '../core/data.js';
import { fmtDate, fmtTime, toKickoffDate } from '../../../utils.js';

import { app, db } from '../../../firebase.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  deleteField
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

bindThemeButton('toggle-theme');
initTabbarActive('matches');

const DIV = (getParam('div') || 'high').toLowerCase();
const ID = getParam('id');

const matchHost = qs('#match-card');
const msgEl = qs('#msg');

const btnEditLineups = qs('#edit-lineups');
const btnEditMatch = qs('#edit-match');

// Events
const btnAddEvent = qs('#add-event');
const eventsHost = qs('#events');
const timelineHost = qs('#events-timeline');
const eventsMsg = qs('#events-msg');
const evForm = qs('#event-form');
const evMinute = qs('#ev-minute');
const evType = qs('#ev-type');
const evTeam = qs('#ev-team');
const evPlayer = qs('#ev-player');
const evSave = qs('#ev-save');
const evCancel = qs('#ev-cancel');

// Lineups
const lineupsHost = qs('#lineups');
const actions = qs('#lineups-actions');
const hint = qs('#lineups-hint');
const btnCancel = qs('#cancel-lineups');
const btnSave = qs('#save-lineups');

let isAuthed = false;
let editingLineups = false;
let editingMatch = false;

function showEventsMsg(text, kind = 'ok') {
  if (!eventsMsg) return;
  eventsMsg.hidden = !text;
  eventsMsg.className = `notice ${kind}`;
  eventsMsg.textContent = text || '';
}

function showMsg(text, kind = 'ok') {
  if (!msgEl) return;
  msgEl.hidden = !text;
  msgEl.className = `notice ${kind}`;
  msgEl.textContent = text || '';
}

function divLabel(div) {
  switch (div) {
    case 'high': return 'ԲԱՐՁՐԱԳՈՒՅՆ';
    case 'first': return 'ԱՌԱՋԻՆ';
    case 'cup': return 'ԳԱՎԱԹ';
    case 'supercup': return 'ՍՈՒՊԵՐ ԳԱՎԱԹ';
    case 'structure': return '24 ԹԻՄ';
    default: return String(div || '').toUpperCase();
  }
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function isoTime(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function toKickoffTS(dateStr, timeStr) {
  const ds = String(dateStr || '').trim();
  const ts = String(timeStr || '').trim();
  if (!ds) return null;
  const t = ts || '00:00';
  const d = new Date(`${ds}T${t}`);
  if (Number.isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

function normalizeTeamId(v) {
  return v == null ? null : String(v);
}

function getTeamIds(m) {
  return {
    homeId: normalizeTeamId(m.homeId ?? m.home),
    awayId: normalizeTeamId(m.awayId ?? m.away),
  };
}

function playerLabel(p) {
  const n = [p.surname, p.name].filter(Boolean).join(' ');
  const num = p.number != null && p.number !== '' ? `#${p.number}` : '';
  return `${num} ${n || p.id}`.trim();
}

function eventEmoji(type) {
  switch (String(type || '').toLowerCase()) {
    case 'goal': return '⚽';
    case 'assist': return '🎯';
    case 'own goal': return '⛔⚽';
    case 'yellow': return '🟨';
    case 'red': return '🟥';
    default: return '•';
  }
}

function lineupsFromMatch(m) {
  const fromObj = m.lineups && typeof m.lineups === 'object' ? m.lineups : null;
  const home = m.lineupHome || (fromObj ? (fromObj.home || fromObj.homeIds || []) : []) || [];
  const away = m.lineupAway || (fromObj ? (fromObj.away || fromObj.awayIds || []) : []) || [];
  return { home: Array.isArray(home) ? home.slice() : [], away: Array.isArray(away) ? away.slice() : [] };
}

/* =========================
   Lineups V2 (num/captain/keepers)
========================= */

function readLineupsV2(match) {
  const v2 = match?.lineupsV2;
  const legacy = lineupsFromMatch(match);

  const toV2 = (ids) => ({
    players: (ids || []).map(id => ({ id: String(id), num: null })),
    captainId: null,
    keeperIds: []
  });

  const home = v2?.home?.players ? {
    players: Array.isArray(v2.home.players) ? v2.home.players.map(x => ({ id: String(x.id), num: x.num ?? null })) : [],
    captainId: v2.home.captainId ? String(v2.home.captainId) : null,
    keeperIds: Array.isArray(v2.home.keeperIds) ? v2.home.keeperIds.map(String) : []
  } : toV2(legacy.home);

  const away = v2?.away?.players ? {
    players: Array.isArray(v2.away.players) ? v2.away.players.map(x => ({ id: String(x.id), num: x.num ?? null })) : [],
    captainId: v2.away.captainId ? String(v2.away.captainId) : null,
    keeperIds: Array.isArray(v2.away.keeperIds) ? v2.away.keeperIds.map(String) : []
  } : toV2(legacy.away);

  return { home, away };
}

function v2Ids(side) {
  return (side?.players || []).map(x => String(x.id));
}

function renderLineupsReadonly(team, roster, selectedIds, v2side) {
  const sel = new Set((selectedIds || []).map(String));
  const selected = roster.filter(p => sel.has(String(p.id)));

  const captainId = v2side?.captainId ? String(v2side.captainId) : null;
  const keeperSet = new Set((v2side?.keeperIds || []).map(String));
  const numMap = new Map((v2side?.players || []).map(x => [String(x.id), x.num ?? null]));

  const pills = selected.map(p => {
    const pid = String(p.id);
    const marks = [
      numMap.get(pid) != null ? `№${numMap.get(pid)}` : '',
      captainId === pid ? 'C' : '',
      keeperSet.has(pid) ? 'GK' : '',
    ].filter(Boolean).join(' • ');

    return el('a', {
      class: 'pill',
      href: `player.html?team=${encodeURIComponent(team?.id || '')}&id=${encodeURIComponent(p.id)}`
    }, marks ? `${playerLabel(p)} (${marks})` : playerLabel(p));
  });

  return el('div', { class: 'card lineup-card' }, [
    el('div', { class: 'lineup-head' }, [
      el('div', { class: 'lineup-title' }, team?.name || '—'),
      el('div', { class: 'muted' }, selected.length ? `${selected.length} խաղացող` : 'Կազմը նշված չէ'),
    ]),
    selected.length ? el('div', { class: 'lineup-list' }, pills) : el('div', { class: 'muted' }, '—')
  ]);
}

function renderLineupsEditV2(team, roster, sideV2) {
  const sel = new Map(); // id -> {id,num}
  (sideV2?.players || []).forEach(x => sel.set(String(x.id), { id: String(x.id), num: x.num ?? null }));

  let captainId = sideV2?.captainId ? String(sideV2.captainId) : null;
  const keeperSet = new Set((sideV2?.keeperIds || []).map(String));

  const list = el('div', { class: 'lineup-edit-table' });

  function syncSideFromState() {
    sideV2.players = Array.from(sel.values());
    sideV2.captainId = captainId || null;
    sideV2.keeperIds = Array.from(keeperSet.values());
  }

  function setCaptain(pid) {
    if (!sel.has(pid)) return;
    captainId = (captainId === pid) ? null : pid;
    syncSideFromState();
    // refresh captain buttons
    list.querySelectorAll('[data-cap]').forEach(btn => {
      const id = btn.getAttribute('data-cap');
      btn.classList.toggle('active', captainId === id);
    });
  }

  function toggleKeeper(pid) {
    if (!sel.has(pid)) return;
    if (keeperSet.has(pid)) keeperSet.delete(pid);
    else keeperSet.add(pid);
    syncSideFromState();
    const btn = list.querySelector(`[data-gk="${pid}"]`);
    if (btn) btn.classList.toggle('active', keeperSet.has(pid));
  }

  roster.forEach(p => {
    const pid = String(p.id);
    const isIn = sel.has(pid);

    const btnToggle = el('button', {
      class: 'btn ghost',
      type: 'button',
      style: 'height:34px;justify-content:flex-start;padding:0 10px;border-radius:12px;'
    }, playerLabel(p));

    const inp = el('input', {
      type: 'number',
      min: '0',
      step: '1',
      placeholder: '№',
      value: (isIn && sel.get(pid)?.num != null) ? String(sel.get(pid).num) : ''
    });

    const capBtn = el('button', { class: `icon-btn ${captainId === pid ? 'active' : ''}`, type: 'button', 'data-cap': pid, title: 'Captain' }, 'C');
    const gkBtn = el('button', { class: `icon-btn ${keeperSet.has(pid) ? 'active' : ''}`, type: 'button', 'data-gk': pid, title: 'Goalkeeper' }, 'GK');

    const row = el('div', { class: 'lu-row' }, [
      btnToggle,
      el('div', { class: 'lu-num' }, [inp]),
      capBtn,
      gkBtn
    ]);

    function syncEnabled() {
      const inNow = sel.has(pid);
      inp.disabled = !inNow;
      capBtn.disabled = !inNow;
      gkBtn.disabled = !inNow;

      if (!inNow) {
        inp.value = '';
        capBtn.classList.remove('active');
        gkBtn.classList.remove('active');
      }
      row.style.borderColor = inNow
        ? 'color-mix(in oklab, var(--accent) 35%, var(--stroke) 65%)'
        : 'var(--stroke)';
    }

    btnToggle.addEventListener('click', () => {
      if (sel.has(pid)) {
        sel.delete(pid);
        if (captainId === pid) captainId = null;
        keeperSet.delete(pid);
      } else {
        sel.set(pid, { id: pid, num: null });
      }
      syncSideFromState();
      syncEnabled();
    });

    inp.addEventListener('input', () => {
      if (!sel.has(pid)) return;
      const v = String(inp.value || '').trim();
      const num = v === '' ? null : Number(v);
      const cur = sel.get(pid);
      cur.num = (num != null && !Number.isNaN(num)) ? num : null;
      sel.set(pid, cur);
      syncSideFromState();
    });

    capBtn.addEventListener('click', () => setCaptain(pid));
    gkBtn.addEventListener('click', () => toggleKeeper(pid));

    syncEnabled();
    list.appendChild(row);
  });

  syncSideFromState();

  return el('div', { class: 'card lineup-card' }, [
    el('div', { class: 'lineup-edit-head' }, [
      el('div', { class: 'lineup-title' }, team?.name || '—'),
      el('div', { class: 'small-muted' }, 'Tap name to add/remove • № / C / GK'),
    ]),
    list
  ]);
}

/* =========================
   Match UI
========================= */

function renderMatchCardReadonly(m, teamsMap) {
  const { homeId, awayId } = getTeamIds(m);

  const home = teamsMap[homeId] || { id: homeId, name: m.homeName || '—', logo: m.homeLogo || '' };
  const away = teamsMap[awayId] || { id: awayId, name: m.awayName || '—', logo: m.awayLogo || '' };

  const dt = toKickoffDate(m);

  const meta = [
    el('span', { class: 'badge' }, divLabel(DIV)),
    el('span', { class: 'muted' }, fmtDate.format(dt)),
    el('span', { class: 'muted' }, fmtTime.format(dt)),
  ];
  if (m.round != null && String(m.round).trim() !== '') meta.push(el('span', { class: 'muted' }, `Տուր ${m.round}`));
  if (m.stage) meta.push(el('span', { class: 'muted' }, String(m.stage)));

  const infoRows = [];
  if (m.location) infoRows.push(el('div', { class: 'kv' }, [el('span', { class: 'muted' }, 'Տեղ:'), el('span', {}, String(m.location))]));
  if (m.note) infoRows.push(el('div', { class: 'kv' }, [el('span', { class: 'muted' }, 'Նշում:'), el('span', {}, String(m.note))]));

  return el('div', { class: 'match-detail' }, [
    el('div', { class: 'meta' }, meta),
    el('div', { class: 'row' }, [
      el('div', { class: 'team side' }, [
        home.logo ? el('img', { class: 'logo-sm', src: home.logo, alt: home.name, loading: 'lazy' }) : null,
        el('span', { class: 'tname' }, home.name),
      ]),
      el('div', { class: 'score big' }, m.score || '—'),
      el('div', { class: 'team side right' }, [
        el('span', { class: 'tname' }, away.name),
        away.logo ? el('img', { class: 'logo-sm', src: away.logo, alt: away.name, loading: 'lazy' }) : null,
      ]),
    ]),
    infoRows.length ? el('div', { class: 'match-extra' }, infoRows) : null,
  ]);
}

function renderMatchEditForm(m) {
  const dt = toKickoffDate(m);
  const dateVal = (m.date && String(m.date).includes('-')) ? m.date : isoDate(dt);
  const timeVal = (m.time && String(m.time).includes(':')) ? m.time : isoTime(dt);

  const inpDate = el('input', { type: 'date', value: dateVal, id: 'mf-date' });
  const inpTime = el('input', { type: 'time', value: timeVal, id: 'mf-time' });
  const inpScore = el('input', { type: 'text', value: m.score || '', placeholder: '2-1', id: 'mf-score' });

  const inpRound = el('input', { type: 'number', value: m.round ?? '', min: '1', step: '1', id: 'mf-round', placeholder: 'Տուր' });
  const inpStage = el('input', { type: 'text', value: m.stage || '', id: 'mf-stage', placeholder: 'stage' });
  const inpLocation = el('input', { type: 'text', value: m.location || '', id: 'mf-location', placeholder: 'Դաշտ / տեղանք' });
  const inpNote = el('textarea', { rows: '3', id: 'mf-note', placeholder: 'Նշում' }, m.note || '');

  const btnCancelLocal = el('button', { class: 'btn ghost', type: 'button' }, 'Չեղարկել');
  const btnSaveLocal = el('button', { class: 'btn', type: 'button' }, 'Պահպանել');

  const form = el('div', { class: 'card' }, [
    el('div', { class: 'form-grid' }, [
      el('label', { class: 'field' }, [el('div', { class: 'label' }, 'Ամսաթիվ'), inpDate]),
      el('label', { class: 'field' }, [el('div', { class: 'label' }, 'Ժամ'), inpTime]),
      el('label', { class: 'field' }, [el('div', { class: 'label' }, 'Հաշիվ'), inpScore]),
      el('label', { class: 'field' }, [el('div', { class: 'label' }, 'Տուր'), inpRound]),
      el('label', { class: 'field' }, [el('div', { class: 'label' }, 'Stage'), inpStage]),
      el('label', { class: 'field' }, [el('div', { class: 'label' }, 'Տեղ'), inpLocation]),
      el('label', { class: 'field field-wide' }, [el('div', { class: 'label' }, 'Նշում'), inpNote]),
    ]),
    el('div', { class: 'row gap' }, [btnCancelLocal, btnSaveLocal]),
  ]);

  return { form, btnCancelLocal, btnSaveLocal, inputs: { inpDate, inpTime, inpScore, inpRound, inpStage, inpLocation, inpNote } };
}

/* =========================
   Events UI (admin-only)
========================= */

function renderTimeline(list, homeTeam, awayTeam) {
  const wrap = el('div', { class: 'timeline-wrap' });
  const sorted = [...list].sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));

  sorted.forEach(ev => {
    const minute = Number(ev.minute || 0);
    const icon = eventEmoji(ev.type);
    const who = ev.playerName || '—';
    const teamKey = String(ev.teamKey || '');
    const sideClass = teamKey === 'away' ? 'right' : 'left';
    const teamName = ev.teamName || (teamKey === 'home' ? homeTeam.name : teamKey === 'away' ? awayTeam.name : '—');

    const content = el('div', { class: `timeline-card ${sideClass}` }, [
      el('div', { class: 'timeline-min' }, `${minute}'`),
      el('div', { class: 'timeline-main' }, [
        el('div', { class: 'timeline-who' }, who),
        el('div', { class: 'timeline-team muted' }, teamName),
      ]),
      el('div', { class: 'timeline-ico' }, icon),
    ]);

    wrap.appendChild(el('div', { class: `timeline-row ${sideClass}` }, [
      content,
      el('div', { class: 'timeline-mid', 'aria-hidden': 'true' }, [
        el('div', { class: 'timeline-dot' })
      ])
    ]));
  });

  return wrap;
}

/* =========================
   Boot
========================= */

async function boot() {
  if (!ID) {
    showMsg('Խաղի id-ը բացակայում է։', 'error');
    return;
  }

  const auth = getAuth(app);

  // auth used only for match editing + events
  onAuthStateChanged(auth, (u) => {
    isAuthed = !!u;

    // Составы — доступны всем
    if (btnEditLineups) btnEditLineups.hidden = false;

    // Матч и события — только админ
    if (btnEditMatch) btnEditMatch.hidden = !isAuthed;
    if (btnAddEvent) btnAddEvent.hidden = !isAuthed;

    if (hint) {
      hint.textContent = 'Կազմերը կարող է խմբագրել բոլորը։ Իրադարձություններ/խաղի տվյալներ՝ միայն ադմին։';
    }

    if (!isAuthed) {
      if (evForm) evForm.hidden = true;
    }
  });

  try {
    const [teams, snap] = await Promise.all([
      getTeamsCached(),
      getDoc(doc(db, `matches/${DIV}/games/${ID}`)),
    ]);

    if (!snap.exists()) {
      showMsg('Խաղը չի գտնվել։', 'error');
      clear(matchHost);
      return;
    }

    const match = { id: snap.id, ...snap.data() };
    const tmap = teamsToMap(teams);

    // teams for match
    const { homeId, awayId } = getTeamIds(match);
    const homeTeam = tmap[homeId] || { id: homeId, name: match.homeName || '—', logo: match.homeLogo || '' };
    const awayTeam = tmap[awayId] || { id: awayId, name: match.awayName || '—', logo: match.awayLogo || '' };

    // rosters
    const [homeRoster, awayRoster] = await Promise.all([
      homeTeam?.id ? getRosterPlayers(homeTeam.id) : Promise.resolve([]),
      awayTeam?.id ? getRosterPlayers(awayTeam.id) : Promise.resolve([]),
    ]);

    // ===== match render =====
    function renderMatchReadonly() {
      clear(matchHost);
      matchHost.appendChild(renderMatchCardReadonly(match, tmap));
    }
    renderMatchReadonly();

    // ===== lineups v2 =====
    let currentV2 = readLineupsV2(match);

    function renderLineupsReadonlyView() {
      clear(lineupsHost);
      const homeIds = v2Ids(currentV2.home);
      const awayIds = v2Ids(currentV2.away);

      lineupsHost.appendChild(renderLineupsReadonly(homeTeam, homeRoster, homeIds, currentV2.home));
      lineupsHost.appendChild(renderLineupsReadonly(awayTeam, awayRoster, awayIds, currentV2.away));

      if (actions) actions.hidden = true;
      editingLineups = false;
    }

    function renderLineupsEditView() {
      clear(lineupsHost);
      lineupsHost.appendChild(renderLineupsEditV2(homeTeam, homeRoster, currentV2.home));
      lineupsHost.appendChild(renderLineupsEditV2(awayTeam, awayRoster, currentV2.away));

      if (actions) actions.hidden = false;
      editingLineups = true;
    }

    renderLineupsReadonlyView();

    btnEditLineups?.addEventListener('click', () => {
      if (editingMatch) return;
      renderLineupsEditView();
    });

    btnCancel?.addEventListener('click', () => {
      renderLineupsReadonlyView();
    });

    btnSave?.addEventListener('click', async () => {
      const homeIds = v2Ids(currentV2.home);
      const awayIds = v2Ids(currentV2.away);

      try {
        await updateDoc(doc(db, `matches/${DIV}/games/${ID}`), {
          lineupsV2: {
            home: {
              players: currentV2.home.players || [],
              captainId: currentV2.home.captainId || null,
              keeperIds: currentV2.home.keeperIds || []
            },
            away: {
              players: currentV2.away.players || [],
              captainId: currentV2.away.captainId || null,
              keeperIds: currentV2.away.keeperIds || []
            }
          },

          // legacy compatibility
          lineupHome: homeIds,
          lineupAway: awayIds,

          updatedAt: serverTimestamp(),
        });

        // update local
        match.lineupsV2 = {
          home: { ...currentV2.home, players: [...(currentV2.home.players || [])], keeperIds: [...(currentV2.home.keeperIds || [])] },
          away: { ...currentV2.away, players: [...(currentV2.away.players || [])], keeperIds: [...(currentV2.away.keeperIds || [])] },
        };
        match.lineupHome = homeIds;
        match.lineupAway = awayIds;

        showMsg('Կազմերը պահպանված են։', 'ok');
        renderLineupsReadonlyView();
      } catch (e) {
        console.error(e);
        showMsg('Չհաջողվեց պահպանել (իրավունքներ կամ կապ)։', 'error');
      }
    });

    // ===== events (admin-only) =====
    const eventsRef = collection(db, `matches/${DIV}/games/${ID}/events`);
    let editEventId = null;

    function fillPlayersForTeam(teamKey, selectedPlayerId) {
      if (!evPlayer) return;
      const roster = teamKey === 'home' ? homeRoster : teamKey === 'away' ? awayRoster : [];
      evPlayer.innerHTML = '<option value="">—</option>';
      roster.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = playerLabel(p);
        if (selectedPlayerId && String(selectedPlayerId) === String(p.id)) opt.selected = true;
        evPlayer.appendChild(opt);
      });
    }

    function openEventCreate() {
      if (!isAuthed || !evForm) return;
      editEventId = null;
      showEventsMsg('', 'ok');
      evMinute.value = '0';
      evType.value = 'goal';
      evTeam.value = '';
      fillPlayersForTeam('', '');
      evForm.hidden = false;
      evMinute.focus();
    }

    function openEventEdit(ev) {
      if (!isAuthed || !evForm) return;
      editEventId = ev.id;
      showEventsMsg('', 'ok');
      evMinute.value = String(ev.minute ?? 0);
      evType.value = String(ev.type || 'goal');
      evTeam.value = String(ev.teamKey || '');
      fillPlayersForTeam(evTeam.value, ev.playerId || '');
      evForm.hidden = false;
      evMinute.focus();
    }

    async function deleteEventById(eventId) {
      if (!isAuthed) return;
      try {
        await deleteDoc(doc(db, `matches/${DIV}/games/${ID}/events/${eventId}`));
        showEventsMsg('Ջնջված է։', 'ok');
        await loadEvents();
      } catch (e) {
        console.error(e);
        showEventsMsg('Չհաջողվեց ջնջել։', 'error');
      }
    }

    function renderEventRow(ev) {
      const minute = Number(ev.minute || 0);
      const who = ev.playerName || '—';
      const teamName =
        ev.teamName ||
        (ev.teamKey === 'home' ? homeTeam.name : ev.teamKey === 'away' ? awayTeam.name : '—');

      const icon = eventEmoji(ev.type);

      const rightBtns = isAuthed ? el('div', { class: 'row gap' }, [
        el('button', { class: 'btn small ghost', type: 'button', 'data-edit': ev.id }, '✏️'),
        el('button', { class: 'btn small danger', type: 'button', 'data-del': ev.id }, '🗑️'),
      ]) : null;

      const row = el('div', { class: 'card event-row' }, [
        el('div', { class: 'row between' }, [
          el('div', { class: 'event-left' }, [
            el('span', { class: 'badge' }, `${minute}'`),
            el('span', { class: 'event-text' }, `${who} (${teamName})`),
            el('span', { class: 'event-emoji' }, icon),
          ]),
          rightBtns
        ])
      ]);

      if (isAuthed && rightBtns) {
        row.querySelector(`[data-edit="${ev.id}"]`)?.addEventListener('click', () => openEventEdit(ev));
        row.querySelector(`[data-del="${ev.id}"]`)?.addEventListener('click', () => deleteEventById(ev.id));
      }

      return row;
    }

    async function loadEvents() {
      if (!eventsHost) return;

      clear(eventsHost);
      if (timelineHost) clear(timelineHost);

      try {
        const snap = await getDocs(eventsRef);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (Number(a.minute || 0) - Number(b.minute || 0)));

        if (!list.length) {
          if (timelineHost) timelineHost.hidden = true;
          eventsHost.appendChild(el('div', { class: 'muted' }, 'Իրադարձություններ չկան։'));
          return;
        }

        if (timelineHost) {
          timelineHost.hidden = false;
          timelineHost.appendChild(renderTimeline(list, homeTeam, awayTeam));
        }

        list.forEach(ev => eventsHost.appendChild(renderEventRow(ev)));
      } catch (e) {
        console.error(e);
        if (timelineHost) timelineHost.hidden = true;
        eventsHost.appendChild(el('div', { class: 'muted' }, 'Չհաջողվեց բեռնել իրադարձությունները։'));
      }
    }

    async function saveEvent() {
      if (!isAuthed) return;

      const teamKey = String(evTeam.value || '').trim();
      if (!teamKey) return showEventsMsg('Ընտրեք թիմ։', 'error');

      const roster = teamKey === 'home' ? homeRoster : awayRoster;
      const pid = String(evPlayer.value || '').trim();
      const player = roster.find(p => String(p.id) === pid);

      const payload = {
        minute: Number(evMinute.value || 0),
        type: String(evType.value || 'goal'),
        teamKey,
        teamId: teamKey === 'home' ? homeTeam.id : awayTeam.id,
        teamName: teamKey === 'home' ? homeTeam.name : awayTeam.name,
        playerId: pid || null,
        playerName: player ? playerLabel(player) : (pid ? pid : '—'),
        matchId: ID,
        div: DIV,
        updatedAt: serverTimestamp(),
      };
      if (!editEventId) payload.createdAt = serverTimestamp();

      try {
        if (editEventId) {
          await setDoc(doc(eventsRef, editEventId), payload, { merge: true });
        } else {
          await addDoc(eventsRef, payload);
        }
        evForm.hidden = true;
        showEventsMsg('Պահպանված է։', 'ok');
        await loadEvents();
      } catch (e) {
        console.error(e);
        showEventsMsg('Չհաջողվեց պահպանել (իրավունքներ կամ կապ)։', 'error');
      }
    }

    btnAddEvent?.addEventListener('click', openEventCreate);
    evCancel?.addEventListener('click', () => { if (evForm) evForm.hidden = true; editEventId = null; });
    evSave?.addEventListener('click', saveEvent);
    evTeam?.addEventListener('change', () => fillPlayersForTeam(evTeam.value, ''));

    await loadEvents();

    // ===== match edit (admin-only) =====
    btnEditMatch?.addEventListener('click', () => {
      if (!isAuthed) return;
      if (editingLineups) return;
      editingMatch = true;

      const { form, btnCancelLocal, btnSaveLocal, inputs } = renderMatchEditForm(match);
      clear(matchHost);
      matchHost.appendChild(form);

      btnCancelLocal.addEventListener('click', () => {
        editingMatch = false;
        renderMatchReadonly();
      });

      btnSaveLocal.addEventListener('click', async () => {
        if (!isAuthed) return;

        const dateStr = inputs.inpDate.value;
        const timeStr = inputs.inpTime.value;
        const scoreStr = (inputs.inpScore.value || '').trim();
        const roundVal = (inputs.inpRound.value || '').trim();
        const stageVal = (inputs.inpStage.value || '').trim();
        const locVal = (inputs.inpLocation.value || '').trim();
        const noteVal = (inputs.inpNote.value || '').trim();

        const payload = {
          date: dateStr || deleteField(),
          time: timeStr || deleteField(),
          kickoff: toKickoffTS(dateStr, timeStr) || deleteField(),
          score: scoreStr || deleteField(),
          round: roundVal ? Number(roundVal) : deleteField(),
          stage: stageVal || deleteField(),
          location: locVal || deleteField(),
          note: noteVal || deleteField(),
          updatedAt: serverTimestamp(),
        };

        try {
          await updateDoc(doc(db, `matches/${DIV}/games/${ID}`), payload);

          match.date = dateStr || undefined;
          match.time = timeStr || undefined;
          match.kickoff = toKickoffTS(dateStr, timeStr) || undefined;
          match.score = scoreStr || undefined;
          match.round = roundVal ? Number(roundVal) : undefined;
          match.stage = stageVal || undefined;
          match.location = locVal || undefined;
          match.note = noteVal || undefined;

          editingMatch = false;
          showMsg('Խաղի տվյալները պահպանված են։', 'ok');
          renderMatchReadonly();
        } catch (e) {
          console.error(e);
          showMsg('Չհաջողվեց պահպանել խաղի տվյալները (իրավունքներ կամ կապ)։', 'error');
        }
      });
    });

  } catch (e) {
    console.error(e);
    showMsg('Սխալ տվյալների բեռնման ժամանակ։', 'error');
  }
}

boot();
