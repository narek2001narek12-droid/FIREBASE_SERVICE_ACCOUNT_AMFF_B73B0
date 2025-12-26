import { bindThemeButton } from "../core/theme.js";
import { getSiteConfig, setSiteConfig } from "../core/config.js";

    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
    import {
      getAuth, onAuthStateChanged, signInWithEmailAndPassword,
      createUserWithEmailAndPassword, signOut
    } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
    import {
      getFirestore, collection, getDocs, getDoc, addDoc,
      setDoc, doc, deleteDoc, query, orderBy, where, serverTimestamp
    } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
    import {
      getStorage, ref, uploadBytes, getDownloadURL
    } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-storage.js";

    // ===== Firebase
    const app = initializeApp({
      apiKey: "AIzaSyDQd4RWarTBFUhRqOVihnMg5UwpuK2ctrU",
      authDomain: "amff-b73b0.firebaseapp.com",
      projectId: "amff-b73b0",
      storageBucket: "amff-b73b0.appspot.com"
    });
    const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);

    // ===== UI helpers
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

// Theme (shared)
bindThemeButton("toggle-theme");

    const confirmModal = $('#confirm');
    const ask = (title, text) => new Promise(res=>{
      $('#confirm-title').textContent=title; $('#confirm-text').textContent=text||'';
      confirmModal.classList.add('show');
      const off=()=>confirmModal.classList.remove('show');
      $('#confirm-no').onclick=()=>{off();res(false)};
      $('#confirm-yes').onclick=()=>{off();res(true)};
    });

    // Section toggles
    $$('.section-box .section-header').forEach(h=>{
      const box=h.parentElement, arrow=h.querySelector('span:last-child');
      h.onclick=()=>{ box.classList.toggle('open'); arrow.textContent = box.classList.contains('open')?'▼':'►'; };
      arrow.textContent = box.classList.contains('open')?'▼':'►';
    });

    // ===== AUTH
    const authBox = $('#auth-box');
    const adminBox = $('#admin-box');
    $('#login').onclick = ()=> signInWithEmailAndPassword(auth, $('#email').value, $('#password').value).catch(e=>alert(e.message));
    $('#register').onclick = ()=> createUserWithEmailAndPassword(auth, $('#email').value, $('#password').value).catch(e=>alert(e.message));
    $('#logout').onclick = ()=> signOut(auth);

    onAuthStateChanged(auth, async user=>{
      if(!user){ authBox.hidden=false; adminBox.hidden=true; return; }
      const u = await getDoc(doc(db,'users',user.uid));
      if(u.exists() && u.data().role==='admin'){
        authBox.hidden=true; adminBox.hidden=false;
        initAdmin();
      }else{
        alert('Դուք ադմին չեք։'); signOut(auth);
      }
    });

    // ===== Admin init
    async function initAdmin(){
      await Promise.all([
        initSiteLinks(),
        loadTeams(), loadTeamsForPlayers(),
        loadMatches(), loadLeagueTable(), setupPlayerStats()
      ]);
    }

    async function initSiteLinks(){
      const ig = $('#site-ig');
      const tg = $('#site-tg');
      const save = $('#site-save');
      const reset = $('#site-reset');
      if(!ig || !tg || !save || !reset) return;
      const cfg = getSiteConfig();
      ig.value = cfg.instagramUrl || '';
      tg.value = cfg.telegramUrl || '';
      save.onclick = ()=>{
        setSiteConfig({ instagramUrl: ig.value.trim(), telegramUrl: tg.value.trim() });
        alert('Պահպանված է (localStorage)');
      };
      reset.onclick = ()=>{
        setSiteConfig({ instagramUrl: 'https://instagram.com', telegramUrl: 'https://t.me' });
        const cfg2 = getSiteConfig();
        ig.value = cfg2.instagramUrl || '';
        tg.value = cfg2.telegramUrl || '';
      };
    }

    // ===== Teams CRUD
    const teamSelect = $('#teamSelect'), teamEditor = $('#team-editor');
    let teamsCache = [];

    async function loadTeams(){
      const snap = await getDocs(collection(db,'teams'));
      teamsCache = snap.docs.map(d=>({id:d.id, ...d.data()}))
        .sort((a,b)=> (a.division||'').localeCompare(b.division||'') || (a.name||'').localeCompare(b.name||''));
      teamSelect.innerHTML = teamsCache.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
      if(teamsCache.length) renderTeam(teamsCache[0].id);
      else teamEditor.innerHTML = '<div class="muted">Թիմեր չկան…</div>';
      teamSelect.onchange = ()=> renderTeam(teamSelect.value);
      $('#newTeam').onclick = ()=> renderTeam(null,true);
    }

    function renderTeam(id, isNew=false){
      const t0 = isNew ? { id:'__new__', name:'', division:'high', logo:'', tournaments:[] } : teamsCache.find(x=>x.id===id);
      const legacyCup = (t0?.division === 'cup');
      const t = { ...t0, division: legacyCup ? 'high' : (t0?.division||'high'), tournaments: Array.isArray(t0?.tournaments) ? t0.tournaments : (legacyCup ? ['cup'] : []) };

      teamEditor.innerHTML = `
        <div class="grid-2">
          <div>
            <label>Անուն</label>
            <input id="t-name" value="${t?.name||''}">
          </div>
          <div>
            <label>Դիվիզիոն</label>
            <select id="t-div">
              <option value="high"${(t?.division||'high')==='high'?' selected':''}>Բարձրագույն</option>
              <option value="first"${t?.division==='first'?' selected':''}>Առաջին</option>
            </select>
            <div class="muted" style="margin-top:6px">* Գավաթ/այլ մրցաշարեր ընտրեք ներքևում (մեկ թիմը կարող է լինել մի քանի մրցաշարերում)</div>
          </div>

          <div style="grid-column:1/-1">
            <label>Մրցաշարեր</label>
            <div class="chips">
              <label class="chip"><input type="checkbox" id="t-tour-cup" ${t.tournaments?.includes('cup')?'checked':''}> AMF Գավաթ</label>
              <label class="chip"><input type="checkbox" id="t-tour-structure" ${t.tournaments?.includes('structure')?'checked':''}> 24 Թիմ (Structure)</label>
              <label class="chip"><input type="checkbox" id="t-tour-supercup" ${t.tournaments?.includes('supercup')?'checked':''}> Supercup</label>
            </div>
          </div>

          <div class="grid-2" style="grid-column:1/-1">
            <div>
              <label>Լոգո (հղում)</label>
              <input id="t-logo" value="${t?.logo||''}">
            </div>
            <div>
              <label>Կամ բեռնել պատկեր</label>
              <input id="t-logo-file" type="file" accept="image/*">
            </div>
          </div>
          <div class="inline" style="gap:8px; grid-column:1/-1">
            <img id="t-logo-img" class="thumb" src="${t?.logo||'https://via.placeholder.com/60?text=🛡️'}" alt="logo">
            <button id="t-save">✅ Պահպանել</button>
            ${isNew ? '' : `<button id="t-delete" class="danger">🗑️ Ջնջել</button>`}
          </div>
        </div>
      `;
      $('#t-logo').oninput = e => $('#t-logo-img').src = e.target.value || 'https://via.placeholder.com/60?text=🛡️';
      $('#t-logo-file').onchange = async e=>{
        const file = e.target.files[0]; if(!file) return;
        const path = `team-logos/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        const snap = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snap.ref);
        $('#t-logo').value = url; $('#t-logo-img').src = url;
      };
      $('#t-save').onclick = async ()=>{
        const tournaments = [];
        if ($('#t-tour-cup')?.checked) tournaments.push('cup');
        if ($('#t-tour-structure')?.checked) tournaments.push('structure');
        if ($('#t-tour-supercup')?.checked) tournaments.push('supercup');
        const payload = { name:$('#t-name').value.trim(), division:$('#t-div').value, logo:$('#t-logo').value.trim(), tournaments };
        if(!payload.name) return alert('Անունը պարտադիր է');
        if(isNew){
          const docRef = await addDoc(collection(db,'teams'), payload);
          alert('Թիմը ստեղծված է'); await loadTeams(); teamSelect.value = docRef.id; renderTeam(docRef.id);
        }else{
          await setDoc(doc(db,'teams',id), payload, {merge:true});
          alert('Պահպանված է'); loadTeams(); loadLeagueTable(); loadMatches();
        }
      };
      if(!isNew){
        $('#t-delete').onclick = async ()=>{
          if(!(await ask('Ջնջե՞լ թիմը', 'Կապված խաղացողներն էլ կկորչեն (ոչ ավտոմատ)'))) return;
          await deleteDoc(doc(db,'teams',id)); alert('Ջնջվեց'); loadTeams(); teamEditor.innerHTML='';
        };
      }
    }

    // ===== Players CRUD
    const playerTeamSelect = $('#playerTeamSelect'),
          playersList = $('#players-list'),
          addPlayerBtn = $('#add-player-btn'),
          newPlayerForm = $('#new-player-form'),
          saveNewPlayerBtn = $('#save-new-player'),
          cancelNewPlayerBtn = $('#cancel-new-player'),
          playersSearch = $('#playersSearch');

    async function loadTeamsForPlayers(){
      const snap = await getDocs(collection(db,'teams'));
      const list = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
      if (!list.length) {
        playerTeamSelect.innerHTML = '';
        playersList.innerHTML = '<div class="muted">Թիմեր չկան…</div>';
        return;
      }
      playerTeamSelect.innerHTML = list.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
      playerTeamSelect.onchange = loadPlayers;
      addPlayerBtn.onclick = ()=>{ newPlayerForm.style.display='grid'; };
      cancelNewPlayerBtn.onclick = ()=>{ newPlayerForm.style.display='none'; };
      // upload photo quick
      $('#new-photo-file').onchange = async e=>{
        const f=e.target.files[0]; if(!f) return;
        const path=`players/${playerTeamSelect.value}/_new/${Date.now()}_${f.name}`;
        const storageRef = ref(storage, path);
        const snap = await uploadBytes(storageRef, f);
        const url = await getDownloadURL(snap.ref);
        $('#new-photo').value = url;
      };
      saveNewPlayerBtn.onclick = saveNewPlayer;
      playersSearch.oninput = ()=> loadPlayers(playersSearch.value.trim().toLowerCase());
      loadPlayers();
    }

    async function loadPlayers(q=''){
      playersList.innerHTML = '';
      const tid = playerTeamSelect.value;
      if (!tid) {
        playersList.innerHTML = '<div class="muted">Թիմ ընտրած չէ…</div>';
        return;
      }
      const snap = await getDocs(collection(db,`teams/${tid}/players`));
      const players = snap.docs.map(d=>({id:d.id, ...d.data()}))
        .filter(p=> !q || (`${p.name||''} ${p.surname||''}`.toLowerCase().includes(q)))
        .sort((a,b)=> (a.surname||'').localeCompare(b.surname||'') || (a.name||'').localeCompare(b.name||''));

      if(!players.length){ playersList.innerHTML='<div class="muted">Խաղացողներ չկան…</div>'; return; }

      players.forEach(p=>{
        const row = document.createElement('div');
        row.className='match-card';
        row.innerHTML = `
          <div class="row" style="align-items:center">
            <img class="thumb" src="${p.photo||'https://via.placeholder.com/60?text=👤'}" alt="p">
            <input id="pname-${p.id}" value="${p.name||''}" placeholder="Անուն">
            <input id="psurname-${p.id}" value="${p.surname||''}" placeholder="Ազգանուն">
            <input id="pnum-${p.id}" type="number" value="${p.number||''}" placeholder="N°" style="width:90px">
            <input id="ppos-${p.id}" value="${p.position||''}" placeholder="Դիրք" style="width:120px">
            <input id="pdob-${p.id}" type="date" value="${p.dob||''}">
          </div>
          <div class="row" style="align-items:center;margin-top:8px">
            <input id="pphoto-${p.id}" class="grow" value="${p.photo||''}" placeholder="Լուսանկարի հղում">
            <input id="pphoto-file-${p.id}" type="file" accept="image/*">
            <button class="btn-small" data-save="${p.id}">✅ Պահպանել</button>
            <button class="btn-small danger" data-del="${p.id}">🗑️ Ջնջել</button>
          </div>
        `;
        row.querySelector(`#pphoto-file-${p.id}`).onchange = async e=>{
          const f=e.target.files[0]; if(!f) return;
          const path=`players/${tid}/${p.id}/${Date.now()}_${f.name}`;
          const storageRef = ref(storage, path);
          const snap = await uploadBytes(storageRef, f);
          const url = await getDownloadURL(snap.ref);
          row.querySelector(`#pphoto-${p.id}`).value = url;
          row.querySelector('img.thumb').src = url;
        };
        row.querySelector(`[data-save="${p.id}"]`).onclick = async ()=>{
          await setDoc(doc(db,`teams/${tid}/players/${p.id}`),{
            name: $('#pname-'+p.id).value.trim(),
            surname: $('#psurname-'+p.id).value.trim(),
            number: +($('#pnum-'+p.id).value||0) || null,
            position: $('#ppos-'+p.id).value.trim()||null,
            dob: $('#pdob-'+p.id).value || null,
            photo: $('#pphoto-'+p.id).value.trim() || null
          }, {merge:true});
          alert('Պահպանվող է');
        };
        row.querySelector(`[data-del="${p.id}"]`).onclick = async ()=>{
          if(!(await ask('Ջնջե՞լ խաղացողին', `${p.name||''} ${p.surname||''}`))) return;
          await deleteDoc(doc(db,`teams/${tid}/players/${p.id}`)); loadPlayers();
        };
        playersList.appendChild(row);
      });
    }

    async function saveNewPlayer(){
      const tid = playerTeamSelect.value;
      if (!tid) return alert('Նախ ընտրեք թիմ');
      const payload = {
        name: $('#new-name').value.trim(),
        surname: $('#new-surname').value.trim(),
        dob: $('#new-dob').value || null,
        number: +($('#new-number').value||0) || null,
        position: $('#new-position').value.trim() || null,
        photo: $('#new-photo').value.trim() || null
      };
      if(!payload.name || !payload.surname) return alert('Անուն/Ազգանուն պարտադիր է');
      await addDoc(collection(db,`teams/${tid}/players`), payload);
      newPlayerForm.style.display='none';
      $('#new-name').value=$('#new-surname').value=$('#new-dob').value=$('#new-number').value=$('#new-position').value=$('#new-photo').value='';
      await loadPlayers();
    }

    // ===== Matches & Events
    const mdSelect = $('#matchDivisionSelect'),
          homeSelect = $('#new-match-home'),
          awaySelect = $('#new-match-away'),
          addMatchBtn = $('#add-match-btn'),
          newMatchForm = $('#new-match-form'),
          saveMatchBtn = $('#save-new-match'),
          cancelMatchBtn = $('#cancel-edit'),
          deleteMatchBtn = $('#delete-match'),
          roundFilter = $('#roundFilter'),
          matchList = $('#match-list'),
          eventMatchSelect = $('#event-match-select'),
          eventList = $('#event-list'),
          addEventBtn = $('#add-event-btn'),
          newEventForm = $('#new-event-form'),
          saveEventBtn = $('#save-event'),
          cancelEventBtn = $('#cancel-event'),
          cupFields = $('#cup-fields'),
          cupStageSel = $('#cup-stage'),
          cupGameIndex = $('#cup-game-index'),
          homeWildcardChk = $('#home-wildcard'),
          awayWildcardChk = $('#away-wildcard'),
          cupNote = $('#cup-note'),
          structureTools = $('#structure-tools'),
          genStructLeagueBtn = $('#gen-structure-league'),
          genStructPlayoffsBtn = $('#gen-structure-playoffs'),
          resetStructBtn = $('#reset-structure'),
          structureFields = $('#structure-fields'),
          structureStageSel = $('#structure-stage'),
          structureGameIndex = $('#structure-game-index'),
          structureLabel = $('#structure-label'),
          structureHomeFrom = $('#structure-home-from'),
          structureAwayFrom = $('#structure-away-from');

    let allMatches = [], editMatchId = null, currentTeamsForSelect = [];

    mdSelect.onchange = async ()=>{
      const isCup = mdSelect.value === 'cup';
      const isStructure = mdSelect.value === 'structure';
      if (cupFields) {
        cupFields.style.display = isCup ? 'block' : 'none';
        if (!isCup) {
          cupStageSel.value = '1/12';
          cupGameIndex.value = '';
          homeWildcardChk.checked = false;
          awayWildcardChk.checked = false;
          cupNote.value = '';
        }
      }

      if (structureTools) {
        structureTools.style.display = isStructure ? 'flex' : 'none';
      }

      if (structureFields) {
        structureFields.style.display = isStructure ? 'block' : 'none';
        if (!isStructure) {
          structureStageSel.value = 'league';
          structureGameIndex.value = '';
          structureLabel.value = '';
          structureHomeFrom.value = '';
          structureAwayFrom.value = '';
        }
      }

      await loadMatches();
      await loadLeagueTable();
    };

    addMatchBtn.onclick = ()=>{
      editMatchId=null; deleteMatchBtn.style.display='none'; newMatchForm.style.display='grid';

      // reset form
      $('#new-match-round').value='';
      $('#new-match-date').value='';
      $('#new-match-time').value='';
      $('#new-match-score').value='';
      if (cupFields && mdSelect.value === 'cup') {
        cupStageSel.value = '1/12';
        cupGameIndex.value = '';
        homeWildcardChk.checked = false;
        awayWildcardChk.checked = false;
        cupNote.value = '';
      }

      if (structureFields && mdSelect.value === 'structure') {
        structureStageSel.value = 'league';
        structureGameIndex.value = '';
        structureLabel.value = '';
        structureHomeFrom.value = '';
        structureAwayFrom.value = '';
      }
    };

    async function loadMatches(){
      // команды для выпадающих списков
      let snapT;
      if (mdSelect.value === 'cup') {
        // Для AMF Գավաթ доступны все команды
        snapT = await getDocs(collection(db,'teams'));
      } else if (mdSelect.value === 'structure') {
        // Structure: берем только участников (teams.tournaments contains 'structure')
        snapT = await getDocs(
          query(collection(db,'teams'), where('tournaments','array-contains','structure'))
        );
      } else {
        snapT = await getDocs(
          query(collection(db,'teams'), where('division','==', mdSelect.value))
        );
      }

      currentTeamsForSelect = snapT.docs
        .map(d=>({id:d.id, ...d.data()}))
        .sort((a,b)=> (a.name||'').localeCompare(b.name||''));

      const fill = (sel) => {
        sel.innerHTML = '';
        sel.add(new Option('—', ''));
        currentTeamsForSelect.forEach(t => sel.add(new Option(t.name, t.id)));
      };
      fill(homeSelect);
      fill(awaySelect);

      const base = collection(db,`matches/${mdSelect.value}/games`);
      let snap;

      if (mdSelect.value === 'cup') {
        // Кубок: сортируем по стадии и номеру игры
        snap = await getDocs(query(base, orderBy('stage'), orderBy('gameIndex')));
        allMatches = snap.docs.map(d=>({id:d.id, ...d.data()}));
      } else if (mdSelect.value === 'structure') {
        // Structure: берем без сложных индексов и сортируем локально
        snap = await getDocs(base);
        allMatches = snap.docs.map(d=>({id:d.id, ...d.data()}));
        const stageOrder = { league:0, playin:1, r16:2, qf:3, sf:4, final:5, sc_qf:6, sc_sf:7, sc_final:8 };
        allMatches.sort((a,b)=>
          (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99) ||
          (Number(a.round||0) - Number(b.round||0)) ||
          (Number(a.gameIndex||0) - Number(b.gameIndex||0)) ||
          String(a.date||'').localeCompare(String(b.date||''))
        );
      } else {
        // Лига: по туру и дате
        snap = await getDocs(query(base, orderBy('round'), orderBy('date')));
        allMatches = snap.docs.map(d=>({id:d.id, ...d.data()}));
      }
      drawMatchList();
    }

    // ===== Structure (24 teams) generators
    function shuffle(arr){
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function circleSchedule(teamIds){
      // Even count required
      const n = teamIds.length;
      if (n % 2 !== 0) throw new Error('Team count must be even');
      const teams = [...teamIds];
      const fixed = teams[0];
      let rest = teams.slice(1);
      const rounds = [];

      for (let r = 0; r < n - 1; r++) {
        const lineup = [fixed, ...rest];
        const pairs = [];
        for (let i = 0; i < n / 2; i++) {
          const a = lineup[i];
          const b = lineup[n - 1 - i];
          // Swap home/away every other round for variety
          const home = (r % 2 === 0) ? a : b;
          const away = (r % 2 === 0) ? b : a;
          pairs.push([home, away]);
        }
        rounds.push(pairs);
        // Rotate rest: take last -> front
        rest = [rest[rest.length - 1], ...rest.slice(0, -1)];
      }
      return rounds; // length n-1
    }

    async function resetStructure(){
      if(!(await ask('Reset Structure','Ջնջե՞լ matches/structure/games ամբողջովին')))
        return;
      const snap = await getDocs(collection(db,'matches','structure','games'));
      for (const d of snap.docs) {
        await deleteDoc(doc(db,'matches','structure','games',d.id));
      }
      await loadMatches();
    }

    async function genStructureLeague(){
      if(mdSelect.value !== 'structure') mdSelect.value = 'structure';
      const teamsSnap = await getDocs(query(collection(db,'teams'), where('tournaments','array-contains','structure')));
      const teams = teamsSnap.docs.map(d=>({id:d.id, ...d.data()}));
      if (teams.length < 4) return alert('Structure թիմերի քանակը քիչ է');
      if (teams.length !== 24) {
        if(!(await ask('Զգուշացում', `Structure-ում հիմա ${teams.length} թիմ է։ Շարունակե՞լ`))) return;
      }

      if (allMatches.length) {
        if(!(await ask('Overwrite?', 'Վերասարքե՞լ Structure League-ը (ջնջելով առկա Structure խաղերը)'))) return;
        await resetStructure();
      }

      const tById = Object.fromEntries(teams.map(t=>[t.id, t]));
      const ids = shuffle(teams.map(t=>t.id));
      const allRounds = circleSchedule(ids);
      const picked = shuffle(allRounds).slice(0, Math.min(10, allRounds.length));

      // Deterministic dates starting tomorrow
      const start = new Date();
      start.setDate(start.getDate() + 1);

      for (let r = 0; r < picked.length; r++) {
        const date = new Date(start.getTime());
        date.setDate(start.getDate() + r);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth()+1).padStart(2,'0');
        const dd = String(date.getDate()).padStart(2,'0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const pairs = picked[r];
        for (let i = 0; i < pairs.length; i++) {
          const [home, away] = pairs[i];
          const id = `league-${r+1}-${String(i+1).padStart(2,'0')}`;
          const payload = {
            stage: 'league',
            round: r+1,
            gameIndex: i+1,
            date: dateStr,
            time: '20:00',
            score: null,
            home,
            away,
            homeName: tById[home]?.name || '',
            awayName: tById[away]?.name || ''
          };
          await setDoc(doc(db,'matches','structure','games', id), payload, {merge:false});
        }
      }
      await loadMatches();
      alert('Structure League գեներացված է');
    }

    function parseScoreStr(score){
      if(!score || !String(score).includes('-')) return null;
      const [a,b] = String(score).split('-').map(x=>parseInt(x,10));
      if(Number.isNaN(a) || Number.isNaN(b)) return null;
      return {h:a,a:b};
    }

    function computeStandings(teams, leagueMatches){
      const stats = {};
      teams.forEach(t=>{ stats[t.id] = { id:t.id, name:t.name||'', pts:0, gf:0, ga:0 } });
      leagueMatches.forEach(m=>{
        const sc = parseScoreStr(m.score);
        if(!sc) return;
        const H = stats[m.home];
        const A = stats[m.away];
        if(!H || !A) return;
        H.gf += sc.h; H.ga += sc.a;
        A.gf += sc.a; A.ga += sc.h;
        if(sc.h > sc.a) H.pts += 3;
        else if(sc.h < sc.a) A.pts += 3;
        else { H.pts += 1; A.pts += 1; }
      });
      return Object.values(stats).sort((a,b)=>
        (b.pts-a.pts) || ((b.gf-b.ga)-(a.gf-a.ga)) || (b.gf-a.gf) || a.name.localeCompare(b.name)
      );
    }

    async function genStructurePlayoffs(){
      if(mdSelect.value !== 'structure') mdSelect.value = 'structure';
      const teamsSnap = await getDocs(query(collection(db,'teams'), where('tournaments','array-contains','structure')));
      const teams = teamsSnap.docs.map(d=>({id:d.id, ...d.data()}));
      if (teams.length < 16) return alert('Structure-ի համար քիչ թիմ կա');

      const mSnap = await getDocs(collection(db,'matches','structure','games'));
      const mAll = mSnap.docs.map(d=>({id:d.id, ...d.data()}));
      const league = mAll.filter(m => (m.stage||'league') === 'league');
      if (!league.length) return alert('League խաղեր չկան');

      const table = computeStandings(teams, league);
      if (table.length < 24) {
        // allow anyway
      }

      const top8 = table.slice(0,8).map(x=>x.id);
      const rest = table.slice(8,24).map(x=>x.id);
      if (top8.length < 8 || rest.length < 16) return alert('Չի ստացվում 1-24 սիդինգ');

      const tById = Object.fromEntries(teams.map(t=>[t.id, t]));

      // Create play-in matches: 9 vs 24, 10 vs 23, ... 16 vs 17
      const playinIds = [];
      for (let i = 0; i < 8; i++) {
        const home = rest[i];
        const away = rest[15 - i];
        const mid = `playin-${i+1}`;
        playinIds.push(mid);
        await setDoc(doc(db,'matches','structure','games', mid), {
          stage:'playin',
          gameIndex:i+1,
          round:null,
          date:null,
          time:null,
          score:null,
          home, away,
          homeName: tById[home]?.name||'',
          awayName: tById[away]?.name||'',
          label: `Play-in #${i+1}`
        }, {merge:false});
      }

      // R16: seed1 vs W:playin-8, seed2 vs W:playin-7, ... seed8 vs W:playin-1
      const r16Ids = [];
      for (let i = 0; i < 8; i++) {
        const home = top8[i];
        const awayFrom = `W:${playinIds[7 - i]}`;
        const mid = `r16-${i+1}`;
        r16Ids.push(mid);
        await setDoc(doc(db,'matches','structure','games', mid), {
          stage:'r16',
          gameIndex:i+1,
          date:null,
          time:null,
          score:null,
          home,
          away:null,
          awayFrom,
          homeName: tById[home]?.name||'',
          awayName: '',
          label: `1/8 #${i+1}`
        }, {merge:false});
      }

      // QF
      const qfIds = [];
      for (let i = 0; i < 4; i++) {
        const mid = `qf-${i+1}`;
        qfIds.push(mid);
        await setDoc(doc(db,'matches','structure','games', mid), {
          stage:'qf',
          gameIndex:i+1,
          date:null,
          time:null,
          score:null,
          home:null,
          away:null,
          homeFrom: `W:${r16Ids[i*2]}`,
          awayFrom: `W:${r16Ids[i*2+1]}`,
          label: `1/4 #${i+1}`
        }, {merge:false});
      }

      // SF
      const sfIds = [];
      for (let i = 0; i < 2; i++) {
        const mid = `sf-${i+1}`;
        sfIds.push(mid);
        await setDoc(doc(db,'matches','structure','games', mid), {
          stage:'sf',
          gameIndex:i+1,
          date:null,
          time:null,
          score:null,
          home:null,
          away:null,
          homeFrom: `W:${qfIds[i*2]}`,
          awayFrom: `W:${qfIds[i*2+1]}`,
          label: `1/2 #${i+1}`
        }, {merge:false});
      }

      // Final
      await setDoc(doc(db,'matches','structure','games','final-1'), {
        stage:'final',
        gameIndex:1,
        date:null,
        time:null,
        score:null,
        home:null,
        away:null,
        homeFrom: `W:${sfIds[0]}`,
        awayFrom: `W:${sfIds[1]}`,
        label: 'Final'
      }, {merge:false});

      // Small Cup (losers of play-in)
      const scQfIds = [];
      for (let i = 0; i < 4; i++) {
        const mid = `scqf-${i+1}`;
        scQfIds.push(mid);
        await setDoc(doc(db,'matches','structure','games', mid), {
          stage:'sc_qf',
          gameIndex:i+1,
          date:null,
          time:null,
          score:null,
          home:null,
          away:null,
          homeFrom: `L:${playinIds[i*2]}`,
          awayFrom: `L:${playinIds[i*2+1]}`,
          label: `Small 1/4 #${i+1}`
        }, {merge:false});
      }

      const scSfIds = [];
      for (let i = 0; i < 2; i++) {
        const mid = `scsf-${i+1}`;
        scSfIds.push(mid);
        await setDoc(doc(db,'matches','structure','games', mid), {
          stage:'sc_sf',
          gameIndex:i+1,
          date:null,
          time:null,
          score:null,
          home:null,
          away:null,
          homeFrom: `W:${scQfIds[i*2]}`,
          awayFrom: `W:${scQfIds[i*2+1]}`,
          label: `Small 1/2 #${i+1}`
        }, {merge:false});
      }

      await setDoc(doc(db,'matches','structure','games','scfinal-1'), {
        stage:'sc_final',
        gameIndex:1,
        date:null,
        time:null,
        score:null,
        home:null,
        away:null,
        homeFrom: `W:${scSfIds[0]}`,
        awayFrom: `W:${scSfIds[1]}`,
        label: 'Small Final'
      }, {merge:false});

      await loadMatches();
      alert('Structure Playoffs գեներացված է');
    }

    if (resetStructBtn) resetStructBtn.onclick = resetStructure;
    if (genStructLeagueBtn) genStructLeagueBtn.onclick = genStructureLeague;
    if (genStructPlayoffsBtn) genStructPlayoffsBtn.onclick = genStructurePlayoffs;

    function drawMatchList(){
      matchList.innerHTML='';

      if (mdSelect.value === 'cup') {
        // ֆիլտր ըստ stage
        const stages = Array.from(
          new Set(allMatches.map(m=>m.stage).filter(Boolean))
        );
        roundFilter.innerHTML =
          `<option value="all">Բոլոր փուլերը</option>` +
          stages.map(s=>`<option value="${s}">${s}</option>`).join('');
      } else if (mdSelect.value === 'structure') {
        const stages = Array.from(new Set(allMatches.map(m => m.stage || 'league')));
        const order = ['league','playin','r16','qf','sf','final','sc_qf','sc_sf','sc_final'];
        stages.sort((a,b)=>(order.indexOf(a)===-1?99:order.indexOf(a)) - (order.indexOf(b)===-1?99:order.indexOf(b)));
        roundFilter.innerHTML =
          `<option value="all">Բոլորը</option>` +
          stages.map(s=>`<option value="${s}">${s}</option>`).join('');
      } else {
        // ֆիլտր ըստ տուրի
        const byRound = {};
        allMatches.forEach(m=>{
          const r = Number(m.round) || 0;
          if (!r) return;
          (byRound[r] ||= []).push(m);
        });
        const rounds = Object.keys(byRound).map(Number).sort((a,b)=>a-b);

        roundFilter.innerHTML =
          `<option value="current">👉 Ընթացիկ</option>` +
          rounds.map(r=>`<option value="${r}">Տուր ${r}</option>`).join('');
      }

      eventMatchSelect.innerHTML = allMatches.map(m=>
        `<option value="${m.id}">${m.homeName} vs ${m.awayName} (${m.date||''} ${m.time||''})</option>`
      ).join('');

      roundFilter.onchange = drawMatchesFiltered;
      drawMatchesFiltered();
      loadEventsList();
    }

    function drawMatchesFiltered(){
      const sel = roundFilter.value;
      const today = new Date().toISOString().slice(0,10);
      let list;

      if (mdSelect.value === 'cup' || mdSelect.value === 'structure') {
        // Cup/Structure: фильтр по стадии
        list = allMatches.filter(m => (sel === 'all') ? true : ((m.stage || 'league') === sel));
      } else {
        // Лига: current = все матчи с сегодняшнего дня и дальше
        if (sel === 'current') {
          list = allMatches.filter(m => (m.date || '9999-12-31') >= today);
        } else {
          list = allMatches.filter(m => String(m.round) === sel);
        }
      }

      matchList.innerHTML = '';
      list.forEach(m=>{
        const div=document.createElement('div'); div.className='match-card';
        const st = m.stage || 'league';
        const label = (mdSelect.value === 'cup')
          ? (st)
          : (mdSelect.value === 'structure')
            ? (st === 'league' ? `league · Տուր ${m.round||'-'}` : st)
            : `Տուր ${m.round}`;
        div.innerHTML = `<b>${label}</b>: ${m.date||''} ${m.time||''} — ${m.homeName} vs ${m.awayName} <i>${m.score||'-'}</i>`;
        div.onclick = ()=>{
          editMatchId = m.id;
          $('#new-match-round').value = m.round||'';
          $('#new-match-date').value = m.date||'';
          $('#new-match-time').value = m.time||'';
          $('#new-match-score').value = m.score||'';
          homeSelect.value = m.home || '';
          awaySelect.value = m.away || '';

          if (cupFields && mdSelect.value === 'cup') {
            cupFields.style.display = 'block';
            cupStageSel.value = m.stage || '1/12';
            cupGameIndex.value = m.gameIndex != null ? m.gameIndex : '';
            homeWildcardChk.checked = !!m.homeWildcard;
            awayWildcardChk.checked = !!m.awayWildcard;
            cupNote.value = m.note || '';
          }

          if (structureFields && mdSelect.value === 'structure') {
            structureFields.style.display = 'block';
            structureStageSel.value = st;
            structureGameIndex.value = m.gameIndex != null ? m.gameIndex : '';
            structureLabel.value = m.label || '';
            structureHomeFrom.value = m.homeFrom || '';
            structureAwayFrom.value = m.awayFrom || '';
          }

          newMatchForm.style.display='grid'; deleteMatchBtn.style.display='inline-block';
        };
        matchList.appendChild(div);
      });
    }

    function toKickoffTS(d, t){
      if(!d) return null;
      const time = t && /^\d{2}:\d{2}$/.test(t) ? t : '00:00';
      const iso = `${d}T${time}:00`;
      const dt = new Date(iso);
      return isNaN(dt.getTime()) ? null : dt;
    }

    async function propagateRefs(div, sourceMatchId){
      // Supports refs: homeFrom/awayFrom = "W:<matchId>" or "L:<matchId>"
      const snap = await getDocs(collection(db, 'matches', div, 'games'));
      const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
      const byId = Object.fromEntries(list.map(m=>[m.id,m]));
      const src = byId[sourceMatchId];
      if (!src) return;

      const sc = parseScoreStr(src.score);
      if (!sc) return;
      if (!src.home || !src.away) return;
      if (sc.h === sc.a) return; // no draws in playoff bracket

      const winner = sc.h > sc.a ? src.home : src.away;
      const loser = sc.h > sc.a ? src.away : src.home;

      const tSnap = await getDocs(collection(db,'teams'));
      const tById = {};
      tSnap.forEach(d=>{ tById[d.id] = d.data(); });
      const tName = (id) => tById[id]?.name || '';

      const writes = [];
      for (const m of list) {
        const patch = {};
        if (m.homeFrom === `W:${sourceMatchId}`) { patch.home = winner; patch.homeName = tName(winner); }
        if (m.homeFrom === `L:${sourceMatchId}`) { patch.home = loser; patch.homeName = tName(loser); }
        if (m.awayFrom === `W:${sourceMatchId}`) { patch.away = winner; patch.awayName = tName(winner); }
        if (m.awayFrom === `L:${sourceMatchId}`) { patch.away = loser; patch.awayName = tName(loser); }
        if (Object.keys(patch).length) {
          writes.push(setDoc(doc(db,'matches',div,'games',m.id), patch, {merge:true}));
        }
      }
      if (writes.length) await Promise.all(writes);
    }

    saveMatchBtn.onclick = async ()=>{
      const isCup = mdSelect.value === 'cup';
      const isStructure = mdSelect.value === 'structure';

      const payload = {
        round: Number($('#new-match-round').value||0),
        date: $('#new-match-date').value || null,
        time: $('#new-match-time').value || null,
        score: $('#new-match-score').value?.trim() || null,
        home: homeSelect.value || null,
        homeName: homeSelect.selectedOptions[0]?.text || '',
        away: awaySelect.value || null,
        awayName: awaySelect.selectedOptions[0]?.text || ''
      };
      if(!payload.date) return alert('Ամսաթիվը պարտադիր է');

      if (payload.home && payload.away && payload.home===payload.away) return alert('Տան/Հյուր չեն կարող նույն թիմը լինել');
      // Round rules
      if (!isCup && !isStructure) {
        if(!payload.round) return alert('Տուրը պարտադիր է');
      }

      const kickoff = toKickoffTS(payload.date, payload.time);
      if(kickoff) payload.kickoff = kickoff;

      if (isCup) {
        payload.stage = cupStageSel.value || '1/12';
        payload.gameIndex = +cupGameIndex.value || null;
        payload.homeWildcard = !!homeWildcardChk.checked;
        payload.awayWildcard = !!awayWildcardChk.checked;
        payload.note = cupNote.value.trim() || null;
      }

      if (isStructure) {
        payload.stage = structureStageSel.value || 'league';
        payload.gameIndex = +structureGameIndex.value || null;
        payload.label = structureLabel.value.trim() || null;
        payload.homeFrom = structureHomeFrom.value.trim() || null;
        payload.awayFrom = structureAwayFrom.value.trim() || null;

        if (payload.stage === 'league' && !payload.round) return alert('League փուլում տուրը պարտադիր է');

        // In playoffs we allow empty home/away if refs provided
        if (payload.stage !== 'league') {
          const hasRefs = !!payload.homeFrom || !!payload.awayFrom;
          if ((!payload.home || !payload.away) && !hasRefs) {
            return alert('Փլեյ-օֆֆում կամ ընտրեք թիմերը, կամ գրեք homeFrom/awayFrom');
          }
        } else {
          if(!payload.home || !payload.away) return alert('Ընտրեք երկու թիմ');
        }
      } else {
        // Non-structure divisions require teams
        if(!payload.home || !payload.away) return alert('Ընտրեք երկու թիմ');
      }

      const base = collection(db,`matches/${mdSelect.value}/games`);
      let savedId = editMatchId;
      if(editMatchId){
        await setDoc(doc(base, editMatchId), payload, {merge:true});
      } else {
        const ref = await addDoc(base, payload);
        savedId = ref.id;
      }

      // Auto-propagate W:/L: references for Cup/Structure
      if ((isCup || isStructure) && savedId) {
        await propagateRefs(mdSelect.value, savedId);
      }

      newMatchForm.style.display='none'; editMatchId=null; await loadMatches(); await loadLeagueTable();
    };
    cancelMatchBtn.onclick = ()=>{ newMatchForm.style.display='none'; editMatchId=null; };
    deleteMatchBtn.onclick = async ()=>{
      if(!editMatchId) return;
      if(!(await ask('Ջնջե՞լ հանդիպումը','Իրադարձությունները նույնպես կջնջվեն ձեռքով, եթե կան'))) return;
      await deleteDoc(doc(db,`matches/${mdSelect.value}/games/${editMatchId}`));
      newMatchForm.style.display='none'; editMatchId=null; await loadMatches(); await loadLeagueTable();
    };

    // Events
    let editEventId=null;
    addEventBtn.onclick = ()=>{ newEventForm.style.display='grid'; editEventId=null;
      $('#event-minute').value=''; $('#event-type').value='goal'; $('#event-team').value=''; $('#event-player').innerHTML='<option value="">— Խաղացող —</option>';
    };
    cancelEventBtn.onclick = ()=>{ newEventForm.style.display='none'; editEventId=null; };

    $('#event-team').onchange = async ()=>{
      const mid = $('#event-match-select').value; if(!mid) return;
      const match = allMatches.find(m=>m.id===mid); if(!match) return;
      const teamKey = $('#event-team').value; if(!teamKey) return;
      const teamId = teamKey==='home'?match.home:match.away;
      const snap = await getDocs(collection(db,`teams/${teamId}/players`));
      const sel = $('#event-player'); sel.innerHTML = '<option value="">— Խաղացող —</option>';
      snap.forEach(d=>{ const p=d.data(); sel.add(new Option(`${p.name||''} ${p.surname||''}`.trim(), `${p.name||''} ${p.surname||''}`.trim())); });
    };

    saveEventBtn.onclick = async ()=>{
      const mid = $('#event-match-select').value; if(!mid) return alert('Ընտրեք խաղ');
      const match = allMatches.find(m=>m.id===mid); if(!match) return;
      const teamKey = $('#event-team').value; if(!teamKey) return alert('Ընտրեք թիմ');
      const data = {
        minute: Number($('#event-minute').value||0),
        type: $('#event-type').value,
        teamKey,
        teamName: teamKey==='home'?match.homeName:match.awayName,
        playerName: $('#event-player').value || '—',
        createdAt: serverTimestamp()
      };
      const ref = collection(db,`matches/${mdSelect.value}/games/${mid}/events`);
      if(editEventId) await setDoc(doc(ref,editEventId), data, {merge:true});
      else await addDoc(ref, data);
      newEventForm.style.display='none'; editEventId=null; loadEventsList();
    };

    async function loadEventsList(){
      eventList.innerHTML='';
      const mid = $('#event-match-select').value; if(!mid) return;
      const snap = await getDocs(collection(db,`matches/${mdSelect.value}/games/${mid}/events`));
      snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.minute||0)-(b.minute||0)).forEach(e=>{
        const emoji = e.type==='goal'?'⚽':e.type==='own goal'?'⛔⚽':e.type==='assist'?'🎯':e.type==='yellow'?'🟨':'🟥';
        const div=document.createElement('div'); div.className='event-card';
        div.innerHTML = `
          ${e.minute||0}' — ${e.playerName||'—'} (${e.teamName||'—'}) ${emoji}
          <div class="inline" style="gap:6px; float:right">
            <button class="btn-small ghost" data-edit="${e.id}">✏️</button>
            <button class="btn-small danger" data-del="${e.id}">🗑️</button>
          </div>
        `;
        div.querySelector(`[data-edit="${e.id}"]`).onclick = async ()=>{
          editEventId = e.id; newEventForm.style.display='grid';
          $('#event-minute').value = e.minute||0; $('#event-type').value = e.type||'goal'; $('#event-team').value = e.teamKey||'';
          const match = allMatches.find(m=>m.id===mid);
          const teamId = (e.teamKey==='home')?match.home:match.away;
          const snapP = await getDocs(collection(db,`teams/${teamId}/players`));
          const sel = $('#event-player'); sel.innerHTML = '<option value="">— Խաղացող —</option>';
          snapP.forEach(d=>{ const p=d.data(); const n=`${p.name||''} ${p.surname||''}`.trim(); const o=new Option(n,n); if(n===e.playerName) o.selected=true; sel.add(o); });
        };
        div.querySelector(`[data-del="${e.id}"]`).onclick = async ()=>{
          if(!(await ask('Ջնջե՞լ իրադարձությունը'))) return;
          await deleteDoc(doc(db,`matches/${mdSelect.value}/games/${mid}/events/${e.id}`));
          loadEventsList();
        };
        eventList.appendChild(div);
      });
    }
    $('#event-match-select').onchange = loadEventsList;

    // ===== League quick table
    async function loadLeagueTable(){
      const divSel = mdSelect.value;

      if (divSel === 'cup') {
        $('#league-table').innerHTML =
          '<p class="muted">AMF Գավաթ-ի համար աղյուսակ չի հաշվարկվում 😊</p>';
        return;
      }

      if (divSel === 'structure') {
        $('#league-table').innerHTML =
          '<p class="muted">Structure-ի համար աղյուսակն ու ցանցը դիտեք Structure էջում 😊</p>';
        return;
      }

      const snapTeams = await getDocs(
        query(collection(db,'teams'), where('division','==',divSel))
      );
      const stats = {};
      snapTeams.forEach(d=> stats[d.id]={ name:d.data().name, played:0, win:0, draw:0, loss:0, gf:0, ga:0, pts:0 });
      const snapM = await getDocs(collection(db,`matches/${divSel}/games`));
      snapM.forEach(d=>{
        const m=d.data(); if(!m.home||!m.away) return;
        const [g1,g2] = (m.score||'').split('-').map(x=>parseInt(x,10));
        if(isNaN(g1)||isNaN(g2)) return;
        const A=stats[m.home], B=stats[m.away]; if(!A||!B) return;
        A.played++; B.played++; A.gf+=g1; A.ga+=g2; B.gf+=g2; B.ga+=g1;
        if(g1>g2){A.win++;A.pts+=3;B.loss++;} else if(g2>g1){B.win++;B.pts+=3;A.loss++;} else {A.draw++;B.draw++;A.pts++;B.pts++; }
      });
      const arr = Object.values(stats).sort((a,b)=> b.pts-a.pts || ((b.gf-b.ga)-(a.gf-a.ga)));
      const tbl=document.createElement('table');
      tbl.innerHTML = `<thead><tr><th>#</th><th>Թիմ</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Pts</th></tr></thead><tbody></tbody>`;
      const tb=tbl.querySelector('tbody');
      arr.forEach((r,i)=> tb.innerHTML += `<tr><td>${i+1}</td><td>${r.name}</td><td>${r.played}</td><td>${r.win}</td><td>${r.draw}</td><td>${r.loss}</td><td>${r.gf}</td><td>${r.ga}</td><td><b>${r.pts}</b></td></tr>`);
      const container = $('#league-table'); container.innerHTML=''; container.appendChild(tbl);
    }

    // ===== Player stats raw edit
    const statTeamSelect = $('#statTeamSelect'),
          statPlayerSelect = $('#statPlayerSelect'),
          statFields = {
            games: $('#stat-games'), goals: $('#stat-goals'),
            assists: $('#stat-assists'), yellow: $('#stat-yellow'), red: $('#stat-red')
          };

    async function setupPlayerStats(){
      const snap = await getDocs(collection(db,'teams'));
      const arr = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=> (a.name||'').localeCompare(b.name||''));;
      if (!arr.length) {
        statTeamSelect.innerHTML = '';
        statPlayerSelect.innerHTML = '';
        return;
      }
      statTeamSelect.innerHTML = arr.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
      statTeamSelect.onchange = ()=> loadPlayersForStats(statTeamSelect.value);
      statPlayerSelect.onchange = ()=> loadPlayerStats(statTeamSelect.value, statPlayerSelect.value);
      $('#savePlayerStats').onclick = savePlayerStats;
      statTeamSelect.dispatchEvent(new Event('change'));
    }
    async function loadPlayersForStats(tid){
      if (!tid) {
        statPlayerSelect.innerHTML = '';
        return;
      }
      const snap = await getDocs(collection(db,`teams/${tid}/players`));
      const arr = snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=> (a.surname||'').localeCompare(b.surname||''));;
      statPlayerSelect.innerHTML = arr.map(p=>`<option value="${p.id}">${p.name||''} ${p.surname||''}</option>`).join('');
      statPlayerSelect.dispatchEvent(new Event('change'));
    }
    async function loadPlayerStats(tid,pid){
      if(!tid||!pid) return;
      const ds = await getDoc(doc(db,`teams/${tid}/players/${pid}/stats/${pid}`));
      const data = ds.exists()?ds.data():{games:0,goals:0,assists:0,yellow:0,red:0};
      statFields.games.value=data.games||0; statFields.goals.value=data.goals||0;
      statFields.assists.value=data.assists||0; statFields.yellow.value=data.yellow||0; statFields.red.value=data.red||0;
    }
    async function savePlayerStats(){
      const tid=statTeamSelect.value, pid=statPlayerSelect.value; if(!tid||!pid) return alert('Ընտրեք թիմ/խաղացող');
      await setDoc(doc(db,`teams/${tid}/players/${pid}/stats/${pid}`),{
        games:+statFields.games.value||0, goals:+statFields.goals.value||0,
        assists:+statFields.assists.value||0, yellow:+statFields.yellow.value||0, red:+statFields.red.value||0
      },{merge:true});
      alert('Վիճակագրությունը պահպանված է');
    }

    // ===== boot
    mdSelect.dispatchEvent(new Event('change'));
