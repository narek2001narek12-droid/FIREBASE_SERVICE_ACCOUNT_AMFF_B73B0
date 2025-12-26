
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy, getDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDQd4RWarTBFUhRqOVihnMg5UwpuK2ctrU",
  authDomain: "amff-b73b0.firebaseapp.com",
  projectId: "amff-b73b0"
});
const db = getFirestore(app);

const divisions = ['high', 'first'];
const filters = {};
let allMatches = {};

window.addEventListener('DOMContentLoaded', () => {
  divisions.forEach(div => initDiv(div));
  setupTeamFilter();

  setTimeout(() => {
    const btn = document.getElementById('close-modal');
    if (btn) btn.onclick = () => {
      document.getElementById('event-modal').style.display = 'none';
    };
  }, 0);
});

function setupTeamFilter() {
  getDocs(collection(db, 'teams')).then(snap => {
    const sel = document.getElementById('teamFilter');
    snap.docs.forEach(d => sel.append(new Option(d.data().name, d.data().name)));
    sel.onchange = () => divisions.forEach(div => renderMatches(div, filters[div], sel.value));
  });
}

async function getTeamPlayers(teamId) {
  const snap = await getDocs(collection(db, `teams/${teamId}/players`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function initDiv(div) {
  const nav = document.querySelector(`#${div}-tabs .tab-nav`);
  nav.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      nav.querySelector('.active').classList.remove('active');
      btn.classList.add('active');
      renderMatches(div, btn.dataset.type);
    };
  });
  filters[div] = 'upcoming';
  await loadMatches(div);
  renderMatches(div);
}

async function loadMatches(div) {
  const snap = await getDocs(query(
    collection(db, `matches/${div}/games`),
    orderBy('round', 'asc'),
    orderBy('date', 'asc')
  ));
  allMatches[div] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function formatDate(d) {
  const dt = new Date(d);
  return new Intl.DateTimeFormat('hy', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dt);
}

function renderMatches(div, type = filters[div], team = '', manualRound = null) {
  filters[div] = type;
  const list = document.getElementById(`${div}-matchlist`);
  const roundSelect = document.getElementById(`${div}-round-select`);
  list.innerHTML = '';
  const nowTime = new Date();

  const filtered = allMatches[div].filter(m => {
    if (team && m.homeName !== team && m.awayName !== team) return false;

    const matchDateTime = m.date + 'T' + (m.time || '00:00');
    const matchTime = new Date(matchDateTime);

    if (type === 'upcoming') return matchTime >= nowTime;
    if (type === 'past') return matchTime < nowTime;

    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<p>📭 Առայժմ տվյալներ չկան</p>`;
    roundSelect.innerHTML = '';
    return;
  }

  const byRound = filtered.reduce((acc, m) => {
    (acc[m.round] = acc[m.round] || []).push(m);
    return acc;
  }, {});

  const rounds = Object.keys(byRound).map(r => +r).sort((a, b) => a - b);
  const showingRound = manualRound ?? (
    type === 'upcoming'
      ? rounds.find(r => byRound[r].some(m => new Date(m.date + 'T' + (m.time || '00:00')) >= nowTime)) || rounds[0]
      : type === 'past'
        ? Math.max(...rounds.filter(r => byRound[r].some(m => new Date(m.date + 'T' + (m.time || '00:00')) < nowTime)))
        : rounds[0]
  );

  roundSelect.innerHTML = rounds.map(r =>
    `<option value="${r}" ${r === showingRound ? 'selected' : ''}>Տուր ${r}</option>`
  ).join('');
  roundSelect.onchange = () => renderMatches(div, type, team, +roundSelect.value);

  list.innerHTML = `<h3 style="grid-column:1/-1">📋 Տուր ${showingRound}</h3>`;
  byRound[showingRound].forEach(m => {
    const el = document.createElement('div');
    el.className = 'match';
    el.dataset.id = m.id;
    el.innerHTML = `
      <span class="date">${formatDate(m.date + 'T' + (m.time || '00:00'))}</span>
      <span>${m.homeName} vs ${m.awayName}</span>
      <span class="score">${m.score || '-'}</span>`;
    el.onclick = () => showMatchSelection(m, div); // показываем состав даже после матча
    list.appendChild(el);
    setTimeout(() => el.classList.add('visible'), 50);
  });
}

async function showMatchSelection(match, division) {
  const modal = document.getElementById('event-modal');
  const box = modal.querySelector('div');
  box.innerHTML = `
    <button id="close-modal">✖</button>
    <h3>Ընտրել թիմը կազմի համար</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
      <button class="team-btn" data-team="home">${match.homeName}</button>
      <button class="team-btn" data-team="away">${match.awayName}</button>
    </div>
    <div id="player-selection-box" style="margin-top: 20px; max-height:400px; overflow:auto;"></div>
  `;
  document.getElementById('close-modal').onclick = () => modal.style.display = 'none';
  modal.style.display = 'flex';

  document.querySelectorAll('.team-btn').forEach(btn => {
    btn.onclick = async () => {
      const teamKey = btn.dataset.team;
      const teamId = match[teamKey];
      const players = await getTeamPlayers(teamId);
      const target = document.getElementById('player-selection-box');
      const matchDoc = await getDoc(doc(db, `matches/${division}/games/${match.id}`));
      const savedRoster = matchDoc.exists() ? matchDoc.data()?.[`roster_${teamKey}`] || [] : [];
      let savedMap = Object.fromEntries(savedRoster.map(p => [p.playerId, p.number]));
      const currentCaptainId = savedRoster.find(p => p.isCaptain)?.playerId;
      const currentGKId = savedRoster.find(p => p.isGoalkeeper)?.playerId;
      const showRosterOnly = savedRoster.length > 0;

      const renderRoster = (editable = false) => {
        target.innerHTML = `<h4>${match[teamKey + 'Name']} — կազմ</h4>`;
        players.forEach(p => {
          const isChecked = savedMap.hasOwnProperty(p.id);
          const number = savedMap[p.id] || '';
          const isCaptain = currentCaptainId === p.id;
          const isGK = currentGKId === p.id;
          if (!editable && isChecked) {
            let roles = '';
            if (isCaptain) roles += ' ⭐';
            if (isGK) roles += ' 🧤';
            const row = document.createElement('div');
            row.textContent = `${number ? number + ' ' : ''}${p.name} ${p.surname}${roles}`;
            target.appendChild(row);
          }
          if (editable) {
            const row = document.createElement('div');
            row.style.marginBottom = '5px';
            row.innerHTML = `
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" class="play-check" data-id="${p.id}" ${isChecked ? 'checked' : ''}>
                ${p.name} ${p.surname}
                <input type="number" class="play-num" data-id="${p.id}" placeholder="N°" value="${number}" style="width:50px;" ${isChecked ? '' : 'disabled'}>
                <label title="Կապիտան">⭐ <input type="radio" name="captain_${teamKey}" class="cap-radio" value="${p.id}" ${isCaptain ? 'checked' : ''}></label>
                <label title="Դարպասապահ">🧤 <input type="radio" name="gk_${teamKey}" class="gk-radio" value="${p.id}" ${isGK ? 'checked' : ''}></label>
              </label>
            `;
            target.appendChild(row);
          }
        });

        if (editable) {
          document.querySelectorAll('.play-check').forEach(cb => {
            cb.onchange = () => {
              const id = cb.dataset.id;
              document.querySelector(`.play-num[data-id="${id}"]`).disabled = !cb.checked;
            };
          });

          const saveBtn = document.createElement('button');
          saveBtn.textContent = '✅ Պահպանել փոփոխությունները';
          saveBtn.style.marginTop = '10px';
          saveBtn.onclick = async () => {
            const newRoster = [];
            const selectedCaptain = document.querySelector(`input[name="captain_${teamKey}"]:checked`)?.value;
            const selectedGK = document.querySelector(`input[name="gk_${teamKey}"]:checked`)?.value;
            for (const p of players) {
              const checked = document.querySelector(`.play-check[data-id="${p.id}"]`).checked;
              const num = document.querySelector(`.play-num[data-id="${p.id}"]`).value;
              if (checked && num) {
                newRoster.push({
                  playerId: p.id,
                  number: +num,
                  isCaptain: p.id === selectedCaptain,
                  isGoalkeeper: p.id === selectedGK
                });
                if (!savedMap[p.id]) {
                  const statRef = doc(db, `teams/${teamId}/players/${p.id}/stats/${p.id}`);
                  const existing = await getDoc(statRef);
                  const data = existing.exists() ? existing.data() : {};
                  const newGames = (data.games || 0) + 1;
                  await setDoc(statRef, { ...data, games: newGames }, { merge: true });
                }
              }
            }
            await setDoc(doc(db, `matches/${division}/games/${match.id}`), {
              [`roster_${teamKey}`]: newRoster
            }, { merge: true });
            alert('Կազմը թարմացվեց');
            savedMap = Object.fromEntries(newRoster.map(p => [p.playerId, p.number]));
            renderRoster(false);
          };
          target.appendChild(saveBtn);
        }

        if (!editable && savedRoster.length > 0) {
          const editBtn = document.createElement('button');
          editBtn.textContent = '✏️ Խմբագրել կազմը';
          editBtn.style.marginTop = '10px';
          editBtn.onclick = () => renderRoster(true);
          target.appendChild(editBtn);
        }
      };

      renderRoster(showRosterOnly ? false : true);
    };
  });
}
