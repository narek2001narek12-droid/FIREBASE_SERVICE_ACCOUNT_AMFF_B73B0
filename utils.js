// utils.js
export const TZ = 'Asia/Yerevan';

export const fmtDate = new Intl.DateTimeFormat('hy-AM', {
  timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric'
});
export const fmtTime = new Intl.DateTimeFormat('hy-AM', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit'
});

// Сбор kickoff-даты из поля Timestamp или пары date/time
export function toKickoffDate(m) {
  if (m?.kickoff && typeof m.kickoff.toDate === 'function') return m.kickoff.toDate();
  const dateStr = (m?.date || '').trim();
  const timeStr = (m?.time || '00:00').trim();
  const d = new Date(`${dateStr}T${timeStr}`);
  return isNaN(d) ? new Date() : d;
}

// БАЗОВЫЙ расчёт таблицы (без head-to-head) — используем на главной
export function computeStandings(matchesDocs, teamsDocs) {
  const stats = {};
  teamsDocs.forEach(d => {
    const t = d.data?.() ?? d.data;
    const id = d.id ?? t.id;
    stats[id] = {
      id, name: t.name || '—', logo: t.logo || '',
      played:0, win:0, draw:0, loss:0, gf:0, ga:0, pts:0
    };
  });

  matchesDocs.forEach(d => {
    const m = d.data?.() ?? d;
    if (!m?.score || !m.score.includes('-')) return;
    const [g1,g2] = m.score.split('-').map(n=>parseInt(n,10));
    if (isNaN(g1) || isNaN(g2)) return;

    const homeKey = m.home ?? m.homeId;
    const awayKey = m.away ?? m.awayId;
    const A = stats[homeKey], B = stats[awayKey];
    if (!A || !B) return;

    A.played++; B.played++;
    A.gf += g1; A.ga += g2;
    B.gf += g2; B.ga += g1;

    if (g1 > g2) { A.win++; B.loss++; A.pts += 3; }
    else if (g2 > g1) { B.win++; A.loss++; B.pts += 3; }
    else { A.draw++; B.draw++; A.pts++; B.pts++; }
  });

  return Object.values(stats).sort((a,b) =>
    b.pts - a.pts ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    a.name.localeCompare(b.name)
  );
}

// Рендер таблицы
export function renderStandingsTable(hostEl, standings) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';

  const tbl = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['#','Թիմ','Pld','W','D','L','GF','GA','Pts'].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
  });
  thead.appendChild(trh); tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  standings.forEach((r, i) => {
    const tr = document.createElement('tr');

    const pos  = document.createElement('td'); pos.innerHTML = `<b>${i+1}</b>`;
    const team = document.createElement('td');
    if (r.logo) {
      const img = document.createElement('img');
      img.src = r.logo; img.alt = r.name; img.loading = 'lazy'; img.width = 24; img.height = 24;
      team.appendChild(img);
    }
    team.appendChild(document.createTextNode(r.name));

    ['played','win','draw','loss','gf','ga','pts'].forEach(k => {
      const td = document.createElement('td');
      if (k === 'pts') td.innerHTML = `<b>${r[k]}</b>`; else td.textContent = r[k];
      tr.appendChild(td);
    });

    tr.insertBefore(team, tr.firstChild);
    tr.insertBefore(pos, tr.firstChild);
    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrapper.appendChild(tbl);
  hostEl.appendChild(wrapper);
}
