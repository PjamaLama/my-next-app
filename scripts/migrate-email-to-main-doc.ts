/// <reference types="firebase-admin" />
require('dotenv').config({ path: '.env.local' });
const { getAdminDb } = require('../lib/firebaseAdmin');

const migrateEmailToMainDoc = async () => {
  console.log('🚀 Starting email/displayName migration to main user documents...');
  const db = getAdminDb();
  const usersRef = db.collection('users');

  try {
    // Get all document references in the users collection
    const userDocs = await usersRef.listDocuments();
    console.log(`Found ${userDocs.length} user document references`);

    if (userDocs.length === 0) {
      console.log('No users found.');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    const promises: Promise<void>[] = [];

    for (const userDocRef of userDocs) {
      console.log(`Processing user: ${userDocRef.id}`);
      const promise = userDocRef.get().then(async (userDoc: FirebaseFirestore.DocumentSnapshot) => {
        try {
          const userData = userDoc.data() || {};

          // Check if email already exists in main document
          if (userData.email) {
            console.log(`  ✅ email already exists in main document: ${userData.email}`);
            skippedCount++;
            return;
          }

          // Get email and displayName from profile subdocument
          const profileRef = userDocRef.collection('private').doc('profile');
          const profileSnap = await profileRef.get();

          if (profileSnap.exists) {
            const profileData = profileSnap.data();
            if (profileData && (profileData.email || profileData.displayName)) {
              const migrationData: any = {};

              if (profileData.email) {
                migrationData.email = profileData.email;
                console.log(`  🔄 Migrating email: ${profileData.email}`);
              }

              if (profileData.displayName) {
                migrationData.displayName = profileData.displayName;
                console.log(`  🔄 Migrating displayName: ${profileData.displayName}`);
              }

              // Add to main document
              await userDocRef.set(migrationData, { merge: true });
              console.log(`  ✅ Successfully migrated email/displayName to main document`);
              migratedCount++;
            } else {
              console.log(`  ⚠️  No email/displayName found in profile`);
              skippedCount++;
            }
          } else {
            console.log(`  ⚠️  No profile document found`);
            skippedCount++;
          }

        } catch (error) {
          console.error(`Error processing user ${userDocRef.id}:`, error);
        }
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`\n🎉 Migration completed!`);
    console.log(`📊 Migrated: ${migratedCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users`);
    console.log(`📈 Total processed: ${userDocs.length} users`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration
console.log('🔥 Firebase Email Migration Script');
console.log('=====================================');

migrateEmailToMainDoc().catch((error) => {
  console.error('💥 Migration script failed:', error);
  process.exit(1);
});
