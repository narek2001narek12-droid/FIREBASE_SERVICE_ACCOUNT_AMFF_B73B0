const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const DIVISIONS = ['high', 'first'];
const CATEGORIES = [
  { field: "goals", col: "scorers" },
  { field: "assists", col: "assists" },
  { field: "yellow", col: "yellow" },
  { field: "red", col: "red" }
];

async function generateTop(division) {
  const teamsSnap = await db.collection("teams").where("division", "==", division).get();
  const allStats = [];

  for (const t of teamsSnap.docs) {
    const tid = t.id;
    const team = t.data();
    const playersSnap = await db.collection(`teams/${tid}/players`).get();

    for (const p of playersSnap.docs) {
      const pid = p.id;
      const pdata = p.data();
      const statSnap = await db.doc(`teams/${tid}/players/${pid}/stats/${pid}`).get();
      if (!statSnap.exists) continue;

      const stat = statSnap.data();
      allStats.push({
        id: pid,
        name: `${pdata.name} ${pdata.surname}`,
        team: team.name,
        logo: team.logo || "",
        goals: stat.goals || 0,
        assists: stat.assists || 0,
        yellow: stat.yellow || 0,
        red: stat.red || 0
      });
    }
  }

  for (const cat of CATEGORIES) {
    const sorted = allStats
      .filter(p => typeof p[cat.field] === "number")
      .sort((a, b) => b[cat.field] - a[cat.field])
      .slice(0, 10);

    const batch = db.batch();
    sorted.forEach(p => {
      const ref = db.doc(`topStats/${division}/${cat.col}/${p.id}`);
      batch.set(ref, {
        name: p.name,
        team: p.team,
        logo: p.logo,
        [cat.field]: p[cat.field]
      });
    });
    await batch.commit();
  }
}

// ✅ Firebase Functions Gen1 (Node.js 18+)
exports.cronGenerateTop = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300 }) // ⏱️ до 5 минут
  .pubsub.schedule('0 9,16 * * *')
  .timeZone('Europe/Moscow')
  .onRun(async () => {
    await generateTop('high');
    await generateTop('first');
    console.log('✅ Top stats updated');
  });
