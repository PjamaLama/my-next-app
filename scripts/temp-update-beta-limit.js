const { getAdminDb } = require('../lib/firebaseAdmin');

async function updateBetaCapacity() {
  try {
    const db = getAdminDb();
    const metaRef = db.doc('meta/beta');
    
    await metaRef.set({ capacity: 300 }, { merge: true });
    
    console.log('Successfully updated beta capacity to 300.');
  } catch (error) {
    console.error('Failed to update beta capacity:', error);
    process.exit(1);
  }
}

updateBetaCapacity();
