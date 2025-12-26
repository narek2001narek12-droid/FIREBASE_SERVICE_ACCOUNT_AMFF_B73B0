const admin = require("firebase-admin");
const fs = require('fs');
const path = require('path');

// SECURITY NOTE:
// Do NOT commit or ship service account keys in the repo.
// Provide credentials locally via one of:
//  - SERVICE_ACCOUNT_PATH=/absolute/path/to/serviceAccountKey.json
//  - GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json
function loadServiceAccount() {
  const p = process.env.SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!p) {
    throw new Error(
      'Missing Firebase Admin credentials. Set SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file.'
    );
  }
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  const raw = fs.readFileSync(abs, 'utf8');
  return JSON.parse(raw);
}

const serviceAccount = loadServiceAccount();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const DIVISIONS = ['high', 'first'];

async function generateAllDivisions() {
  for (const div of DIVISIONS) {
    await generateTopStatsForDivision(div);
  }
  console.log('✅ Top stats for all divisions uploaded!');
}

async function generateTopStatsForDivision(DIVISION) {
  const teamsSnap = await db.collection('teams').where('division', '==', DIVISION).get();
  const allStats = [];

  for (const teamDoc of teamsSnap.docs) {
    const teamId = teamDoc.id;
    const teamName = teamDoc.data().name;
    const playersSnap = await db.collection(`teams/${teamId}/players`).get();

    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      const statRef = db.doc(`teams/${teamId}/players/${playerId}/stats/${playerId}`);
      const statSnap = await statRef.get();

      if (!statSnap.exists) continue;
      const stat = statSnap.data();

     allStats.push({
      id: playerId,
  name: `${playerData.name} ${playerData.surname}`,
  team: teamName,
  logo: teamDoc.data().logo || "", // добавляем логотип из документа команды
  goals: stat.goals || 0,
  assists: stat.assists || 0,
  yellow: stat.yellow || 0,
  red: stat.red || 0
});
    }
  }

  await uploadTop(DIVISION, 'scorers', sortAndSlice(allStats, 'goals'));
  await uploadTop(DIVISION, 'assists', sortAndSlice(allStats, 'assists'));
  await uploadTop(DIVISION, 'yellow', sortAndSlice(allStats, 'yellow'));
  await uploadTop(DIVISION, 'red', sortAndSlice(allStats, 'red'));

  console.log(`📊 ${DIVISION.toUpperCase()} uploaded`);
}

function sortAndSlice(arr, key) {
  return arr.sort((a, b) => b[key] - a[key]).slice(0, 6);
}

async function uploadTop(division, type, data) {
  const colRef = db.collection(`topStats/${division}/${type}`);
  const batch = db.batch();

  const snap = await colRef.get();
  snap.forEach(doc => batch.delete(doc.ref));

  data.forEach(p => {
  const docRef = colRef.doc(p.id); // ✅ Используем уникальный ID игрока

  batch.set(docRef, {
    name: p.name,
    team: p.team,
    logo: p.logo || "",
    [type === 'scorers' ? 'goals' :
     type === 'assists' ? 'assists' :
     type === 'yellow' ? 'yellow' : 'red']: 
     p[type === 'scorers' ? 'goals' :
       type === 'assists' ? 'assists' :
       type === 'yellow' ? 'yellow' : 'red']
  });
});



  await batch.commit();
}

generateAllDivisions().catch(console.error);
