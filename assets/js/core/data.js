import { db } from '../../../firebase.js';
import {
  collection,
  getDoc,
  getDocs,
  doc,
} from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

let _teamsCache = null;

export async function getTeamsCached(force = false) {
  if (_teamsCache && !force) return _teamsCache;
  const snap = await getDocs(collection(db, 'teams'));
  _teamsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (a.name||'').localeCompare(b.name||''));
  return _teamsCache;
}

export function teamsToMap(teams) {
  const map = {};
  (teams||[]).forEach(t => { map[t.id] = t; });
  return map;
}

export async function getTeam(teamId) {
  const s = await getDoc(doc(db, 'teams', teamId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function getRosterPlayers(teamId) {
  const snap = await getDocs(collection(db, `teams/${teamId}/players`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => ((a.surname||'') + (a.name||'')).localeCompare((b.surname||'') + (b.name||'')));
}

export async function getPlayer(teamId, playerId) {
  const s = await getDoc(doc(db, `teams/${teamId}/players/${playerId}`));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function getPlayerStats(teamId, playerId) {
  // try common ids used in existing pages
  const paths = [
    `teams/${teamId}/players/${playerId}/stats/season-25-26`,
    `teams/${teamId}/players/${playerId}/stats/${playerId}`,
    `teams/${teamId}/players/${playerId}/stats/main`,
  ];
  for (const p of paths) {
    const s = await getDoc(doc(db, p));
    if (s.exists()) return s.data();
  }
  return {};
}

export async function getMatchesForTeam(teamId, divisions = ['high','first','cup','supercup','structure']) {
  const out = [];
  for (const div of divisions) {
    try {
      const snap = await getDocs(collection(db, `matches/${div}/games`));
      snap.docs.forEach(d => {
        const m = d.data();
        const home = m.home ?? m.homeId;
        const away = m.away ?? m.awayId;
        if (home === teamId || away === teamId) out.push({ id: d.id, _div: div, ...m });
      });
    } catch (e) {
      // ignore missing collections
    }
  }
  return out;
}
