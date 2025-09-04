/// <reference types="firebase-admin" />
import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebaseAdmin';
require('dotenv').config({ path: '.env.local' });

const migrateUserType = async () => {
  console.log('🚀 Starting userType migration...');
  const db = getAdminDb();
  const usersRef = db.collection('users');

  // The issue: Firestore .get() only returns documents with actual data
  // But your users exist as empty documents with only subcollections
  // We need to use listDocuments() to get ALL document references
  console.log('Querying users collection using listDocuments()...');

  try {
    // Get all document references in the users collection
    const userDocs = await usersRef.listDocuments();
    console.log(`Found ${userDocs.length} user document references using listDocuments()`);

    // Show all user IDs found
    console.log('\nAll user IDs found:');
    userDocs.forEach((docRef, index) => {
      console.log(`${index + 1}. ${docRef.id}`);
    });
    console.log('');

    if (userDocs.length === 0) {
      console.log('No users found.');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    const promises = [];

    for (const userDocRef of userDocs) {
      console.log(`Processing user: ${userDocRef.id}`);
      const privateProfileRef = userDocRef.collection('private').doc('profile');
      const promise = userDocRef.get().then(async (userDoc) => {
        try {
          const userData = userDoc.data() || {};

          // Check if userType already exists in main document
          if (userData.userType) {
            console.log(`  ✅ userType already exists in main document: ${userData.userType}`);
            skippedCount++;
            return;
          }

          // Check if userType exists in private profile
          const profileDoc = await privateProfileRef.get();

          if (profileDoc.exists) {
            const profileData = profileDoc.data();

            if (profileData && profileData.userType) {
              console.log(`  🔄 Migrating userType from profile: ${profileData.userType}`);

              // Move userType to main document
              await userDocRef.set({
                userType: profileData.userType
              }, { merge: true });

              // Remove userType from profile document
              await privateProfileRef.update({
                userType: require('firebase-admin').firestore.FieldValue.delete()
              });

              console.log(`  ✅ Successfully migrated userType to main document`);
              migratedCount++;
            } else {
              console.log(`  ⚠️  No userType found in profile, setting default`);
              // Set default userType for users without it
              await userDocRef.set({
                userType: 'free'
              }, { merge: true });
              migratedCount++;
            }
          } else {
            console.log(`  ⚠️  No profile document found, setting default userType`);
            // Set default userType for users without profile
            await userDocRef.set({
              userType: 'free'
            }, { merge: true });
            migratedCount++;
          }

        } catch (error) {
          console.error(`Error processing user ${userDocRef.id}:`, error);
          console.error(`Error details:`, error instanceof Error ? error.message : String(error));
        }
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`\n🎉 Migration completed!`);
    console.log(`📊 Migrated: ${migratedCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users (already had userType in main doc)`);
    console.log(`📈 Total processed: ${userDocs.length} users`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Verification function to check migration results
const verifyMigration = async () => {
  console.log('\n🔍 Verifying migration...');
  const db = getAdminDb();

  try {
    // Get all document references in the users collection
    const usersRef = db.collection('users');
    const userDocs = await usersRef.listDocuments();
    console.log(`Found ${userDocs.length} user document references for verification`);

    if (userDocs.length === 0) {
      console.log('No users found.');
      return;
    }

    let verifiedCount = 0;
    let issuesCount = 0;
    const promises = [];

    for (const userDocRef of userDocs) {
      const promise = userDocRef.get().then(async (userDoc) => {
        try {
          const userId = userDocRef.id;
          const userData = userDoc.data() || {};

          if (userData.userType) {
            console.log(`✅ ${userId}: userType = ${userData.userType}`);
            verifiedCount++;
          } else {
            console.log(`❌ ${userId}: Missing userType!`);
            issuesCount++;
          }

          // Check if userType still exists in profile (should be removed)
          const profileRef = userDocRef.collection('private').doc('profile');
          const profileSnap = await profileRef.get();

          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            if (profileData && profileData.userType) {
              console.log(`⚠️  ${userId}: userType still exists in profile document!`);
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
    console.log(`✅ Verified: ${verifiedCount} users`);
    console.log(`❌ Issues: ${issuesCount} users`);

    if (issuesCount === 0) {
      console.log('🎉 All users successfully migrated!');
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
    console.log('🔥 Firebase userType Migration Script');
    console.log('=====================================');

    await migrateUserType();
    await verifyMigration();

    console.log('\n✨ Migration script completed successfully!');
    console.log('📝 Note: You can now safely remove userType from profile documents');

  } catch (error) {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  }
};

// Check command line arguments to determine which function to run
const args = process.argv.slice(2);
if (args.includes('--verify')) {
  console.log('Running verification only...');
  verifyMigration().catch((error) => {
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
