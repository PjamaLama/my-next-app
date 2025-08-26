
import 'dotenv/config';
import { getAdminDb } from '../lib/firebaseAdmin';

const migrateUsers = async () => {
  console.log('Starting user migration...');
  const db = getAdminDb();
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  if (snapshot.empty) {
    console.log('No users found.');
    return;
  }

  let updatedCount = 0;
  const promises = [];

  for (const userDoc of snapshot.docs) {
    const privateProfileRef = userDoc.ref.collection('private').doc('profile');
    const promise = privateProfileRef.get().then(async (profileDoc) => {
      if (profileDoc.exists) {
        const profileData = profileDoc.data();
        if (profileData && typeof profileData.message_count === 'undefined') {
          console.log(`Updating user ${userDoc.id}...`);
          await privateProfileRef.update({
            message_count: 0,
            last_reset: new Date(),
          });
          updatedCount++;
        }
      }
    });
    promises.push(promise);
  }

  await Promise.all(promises);

  console.log(`Migration complete. Updated ${updatedCount} users.`);
};

migrateUsers().catch((error) => {
  console.error('Error during migration:', error);
  process.exit(1);
});
