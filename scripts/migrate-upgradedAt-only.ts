/// <reference types="firebase-admin" />
import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebaseAdmin';
require('dotenv').config({ path: '.env.local' });

const migrateUpgradedAtOnly = async () => {
  console.log('🚀 Starting upgradedAt-only migration...');
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
      const promise = userDocRef.get().then(async (userDoc: FirebaseFirestore.DocumentSnapshot) => {
        try {
          const userData = userDoc.data() || {};

          // Skip if user already has upgradedAt in main document
          if (userData.upgradedAt) {
            console.log(`✅ ${userDocRef.id}: upgradedAt already in main document`);
            skippedCount++;
            return;
          }

          // Check if upgradedAt exists in profile document
          const profileRef = userDocRef.collection('private').doc('profile');
          const profileDoc = await profileRef.get();

          if (profileDoc.exists) {
            const profileData = profileDoc.data();

            if (profileData && profileData.upgradedAt) {
              console.log(`🔄 Migrating upgradedAt for user: ${userDocRef.id}`);
              console.log(`   upgradedAt: ${profileData.upgradedAt.toDate ? profileData.upgradedAt.toDate() : profileData.upgradedAt}`);

              // Move upgradedAt to main document
              await userDocRef.set({
                upgradedAt: profileData.upgradedAt
              }, { merge: true });

              // Remove upgradedAt from profile document
              await profileRef.update({
                upgradedAt: admin.firestore.FieldValue.delete()
              });

              console.log(`✅ Successfully migrated upgradedAt to main document for ${userDocRef.id}`);
              migratedCount++;
            } else {
              console.log(`⏭️ ${userDocRef.id}: No upgradedAt found in profile`);
              skippedCount++;
            }
          } else {
            console.log(`⏭️ ${userDocRef.id}: No profile document found`);
            skippedCount++;
          }

        } catch (error) {
          console.error(`Error processing user ${userDocRef.id}:`, error);
          console.error(`Error details:`, error instanceof Error ? error.message : String(error));
        }
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`\n🎉 upgradedAt Migration completed!`);
    console.log(`📊 Migrated: ${migratedCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users (no upgradedAt to migrate)`);
    console.log(`📈 Total processed: ${userDocs.length} users`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Verification function
const verifyUpgradedAtMigration = async () => {
  console.log('\n🔍 Verifying upgradedAt migration...');
  const db = getAdminDb();

  try {
    const usersRef = db.collection('users');
    const userDocs = await usersRef.listDocuments();
    console.log(`Found ${userDocs.length} user document references for verification`);

    if (userDocs.length === 0) {
      console.log('No users found.');
      return;
    }

    let verifiedCount = 0;
    let issuesCount = 0;
    const promises: Promise<void>[] = [];

    for (const userDocRef of userDocs) {
      const promise = userDocRef.get().then(async (userDoc: FirebaseFirestore.DocumentSnapshot) => {
        try {
          const userId = userDocRef.id;
          const userData = userDoc.data() || {};

          // Check if upgradedAt exists in main document
          if (userData.upgradedAt) {
            console.log(`✅ ${userId}: upgradedAt in main document - ${userData.upgradedAt.toDate ? userData.upgradedAt.toDate() : userData.upgradedAt}`);
            verifiedCount++;
          } else {
            console.log(`ℹ️ ${userId}: No upgradedAt in main document`);
          }

          // Check if upgradedAt still exists in profile (should be removed)
          const profileRef = userDocRef.collection('private').doc('profile');
          const profileSnap = await profileRef.get();

          if (profileSnap.exists && profileSnap.exists()) {
            const profileData = profileSnap.data();
            if (profileData && profileData.upgradedAt) {
              console.log(`⚠️  ${userId}: upgradedAt still exists in profile document!`);
              issuesCount++;
            }
          }
        } catch (error) {
          console.error(`Error verifying user ${userDocRef.id}:`, error);
          console.error(`Error details:`, error instanceof Error ? error.message : String(error));
          issuesCount++;
        }
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`\n📊 Verification complete:`);
    console.log(`✅ Users with upgradedAt: ${verifiedCount}`);
    console.log(`❌ Issues: ${issuesCount} users`);

    if (issuesCount === 0) {
      console.log('🎉 All upgradedAt migrations verified!');
    } else {
      console.log('⚠️  Some issues found - manual review needed');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
};

// Run migration
const main = async () => {
  try {
    console.log('🔥 Firebase upgradedAt Migration Script');
    console.log('=======================================');

    await migrateUpgradedAtOnly();
    await verifyUpgradedAtMigration();

    console.log('\n✨ upgradedAt migration script completed successfully!');
    console.log('📝 Note: You can now safely remove upgradedAt from profile documents');

  } catch (error) {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  }
};

// Check command line arguments
const args = process.argv.slice(2);
if (args.includes('--verify')) {
  console.log('Running verification only...');
  verifyUpgradedAtMigration().catch((error) => {
    console.error('Error during verification:', error);
    process.exit(1);
  });
} else {
  console.log('Running migration mode...');
  main().catch((error) => {
    console.error('Error during migration:', error);
    process.exit(1);
  });
}
