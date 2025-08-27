/// <reference types="firebase-admin" />
require('dotenv').config({ path: '.env.local' });
const { getAdminDb } = require('../lib/firebaseAdmin');

const migrateSelectedSheets = async () => {
  console.log('Starting selectedSheetNames migration...');
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
    const promises = [];

    for (const userDocRef of userDocs) {
      console.log(`Processing user: ${userDocRef.id}`);
      const privateProfileRef = userDocRef.collection('private').doc('profile');

      const promise = privateProfileRef.get().then(async (profileDoc: FirebaseFirestore.DocumentSnapshot) => {
        try {
          if (profileDoc.exists) {
            const profileData = profileDoc.data();
            const { selectedSheetNames, defaultSpreadsheetId } = profileData || {};

            // Check if there's data to migrate
            const hasDataToMigrate = selectedSheetNames && selectedSheetNames.length > 0 || defaultSpreadsheetId;

            if (hasDataToMigrate) {
              console.log(`Migrating data for user ${userDocRef.id}...`);

              // Move to main user document
              await userDocRef.set({
                selectedSheetNames: selectedSheetNames || [],
                defaultSpreadsheetId: defaultSpreadsheetId || ""
              }, { merge: true });

              // Remove from private profile
              const updateData: any = {};
              if (selectedSheetNames !== undefined) {
                updateData.selectedSheetNames = require('firebase-admin').firestore.FieldValue.delete();
              }
              if (defaultSpreadsheetId !== undefined) {
                updateData.defaultSpreadsheetId = require('firebase-admin').firestore.FieldValue.delete();
              }

              await privateProfileRef.update(updateData);

              migratedCount++;
              console.log(`✅ Successfully migrated user ${userDocRef.id}`);
            } else {
              skippedCount++;
              console.log(`⏭️  Skipped user ${userDocRef.id} (no data to migrate)`);
            }
          } else {
            skippedCount++;
            console.log(`⏭️  Skipped user ${userDocRef.id} (no private profile)`);
          }
        } catch (error) {
          console.error(`❌ Error processing user ${userDocRef.id}:`, error);
          console.error(`Error details:`, error instanceof Error ? error.message : String(error));
        }
      });

      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`\nMigration complete:`);
    console.log(`✅ Migrated: ${migratedCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users`);
    console.log(`📊 Total processed: ${migratedCount + skippedCount} users`);

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
};

const createBackup = async () => {
  console.log('Creating backup of current selectedSheetNames data...');
  const db = getAdminDb();
  const usersRef = db.collection('users');
  const backupCollection = db.collection('migration_backups').doc('selectedSheets_backup').collection('users');

  try {
    const userDocs = await usersRef.listDocuments();
    console.log(`Found ${userDocs.length} users to backup`);

    let backedUpCount = 0;
    const promises = [];

    for (const userDocRef of userDocs) {
      const privateProfileRef = userDocRef.collection('private').doc('profile');

      const promise = privateProfileRef.get().then(async (profileDoc: FirebaseFirestore.DocumentSnapshot) => {
        if (profileDoc.exists) {
          const profileData = profileDoc.data();
          const { selectedSheetNames, defaultSpreadsheetId } = profileData || {};

          if (selectedSheetNames || defaultSpreadsheetId) {
            await backupCollection.doc(userDocRef.id).set({
              selectedSheetNames: selectedSheetNames || [],
              defaultSpreadsheetId: defaultSpreadsheetId || "",
              backedUpAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
            });
            backedUpCount++;
            console.log(`📁 Backed up user ${userDocRef.id}`);
          }
        }
      });

      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`✅ Backup complete: ${backedUpCount} users backed up`);

  } catch (error) {
    console.error('Error during backup:', error);
    process.exit(1);
  }
};

const restoreBackup = async () => {
  console.log('Restoring selectedSheetNames from backup...');
  const db = getAdminDb();
  const backupCollection = db.collection('migration_backups').doc('selectedSheets_backup').collection('users');

  try {
    const backupDocs = await backupCollection.listDocuments();
    console.log(`Found ${backupDocs.length} backup records to restore`);

    let restoredCount = 0;
    const promises = [];

    for (const backupDocRef of backupDocs) {
      const promise = backupDocRef.get().then(async (backupDoc: FirebaseFirestore.DocumentSnapshot) => {
        if (backupDoc.exists) {
          const backupData = backupDoc.data();
          const userId = backupDocRef.id;

          // Move back to private profile
          const privateProfileRef = db.collection('users').doc(userId).collection('private').doc('profile');
          await privateProfileRef.set({
            selectedSheetNames: backupData?.selectedSheetNames || [],
            defaultSpreadsheetId: backupData?.defaultSpreadsheetId || ""
          }, { merge: true });

          // Remove from main user document
          const userDocRef = db.collection('users').doc(userId);
          await userDocRef.update({
            selectedSheetNames: require('firebase-admin').firestore.FieldValue.delete(),
            defaultSpreadsheetId: require('firebase-admin').firestore.FieldValue.delete()
          });

          restoredCount++;
          console.log(`🔄 Restored user ${userId}`);
        }
      });

      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`✅ Restore complete: ${restoredCount} users restored`);

  } catch (error) {
    console.error('Error during restore:', error);
    process.exit(1);
  }
};

// Check command line arguments to determine which function to run
const args = process.argv.slice(2);
if (args.includes('--backup')) {
  console.log('Running backup mode...');
  createBackup().catch((error) => {
    console.error('Error during backup:', error);
    process.exit(1);
  });
} else if (args.includes('--restore')) {
  console.log('Running restore mode...');
  restoreBackup().catch((error) => {
    console.error('Error during restore:', error);
    process.exit(1);
  });
} else {
  console.log('Running migration mode...');
  migrateSelectedSheets().catch((error) => {
    console.error('Error during migration:', error);
    process.exit(1);
  });
}
