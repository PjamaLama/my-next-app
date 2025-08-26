/// <reference types="firebase-admin" />
require('dotenv').config({ path: '.env.local' });
const { getAdminDb } = require('../lib/firebaseAdmin');

const migrateUsers = async () => {
  console.log('Starting user migration...');
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
    userDocs.forEach((docRef: FirebaseFirestore.DocumentReference, index: number) => {
      console.log(`${index + 1}. ${docRef.id}`);
    });
    console.log('');

    if (userDocs.length === 0) {
      console.log('No users found.');
      return;
    }

    // Use serverTimestamp() for consistent timing
    const lastResetDate = require('firebase-admin').firestore.FieldValue.serverTimestamp();

    let updatedCount = 0;
    const promises = [];

    for (const userDocRef of userDocs) {
      console.log(`Processing user: ${userDocRef.id}`);
      const privateProfileRef = userDocRef.collection('private').doc('profile');
      const promise = privateProfileRef.get().then(async (profileDoc: FirebaseFirestore.DocumentSnapshot) => {
        try {
          // Prepare the data to be stored in both locations
          const userData = {
            message_count: 0,
            last_reset: lastResetDate,
          };

          if (profileDoc.exists) {
            console.log(`Updating user ${userDocRef.id} (existing profile)...`);
            await privateProfileRef.update(userData);
            updatedCount++;
            console.log(`Successfully updated user ${userDocRef.id}`);
          } else {
            console.log(`Creating profile for user ${userDocRef.id} (no existing profile found)...`);
            await privateProfileRef.set(userData);
            updatedCount++;
            console.log(`Successfully created profile for user ${userDocRef.id}`);
          }

          // Denormalize: Also store message_count and last_reset on the main user document
          console.log(`Denormalizing data to main user document for ${userDocRef.id}...`);
          // Use set with merge to handle cases where the main user document doesn't exist
          await userDocRef.set(userData, { merge: true });
          console.log(`Successfully denormalized data for user ${userDocRef.id}`);

        } catch (error) {
          console.error(`Error processing user ${userDocRef.id}:`, error);
          console.error(`Error details:`, error instanceof Error ? error.message : String(error));
        }
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`Migration complete. Updated ${updatedCount} users.`);
  } catch (error) {
    console.error('Error listing user documents:', error);
    process.exit(1);
  }
};

const cleanupProfileFields = async () => {
  console.log('Starting cleanup of message_count and last_reset from private/profile documents...');
  const db = getAdminDb();
  const usersRef = db.collection('users');

  try {
    // Get all document references in the users collection
    const userDocs = await usersRef.listDocuments();
    console.log(`Found ${userDocs.length} user document references for cleanup`);

    if (userDocs.length === 0) {
      console.log('No users found.');
      return;
    }

    let cleanedCount = 0;
    const promises = [];

    for (const userDocRef of userDocs) {
      console.log(`Processing cleanup for user: ${userDocRef.id}`);
      const privateProfileRef = userDocRef.collection('private').doc('profile');
      const promise = privateProfileRef.get().then(async (profileDoc: FirebaseFirestore.DocumentSnapshot) => {
        try {
          if (profileDoc.exists) {
            const profileData = profileDoc.data();
            // Check if the profile has the fields we want to remove
            if (profileData && (profileData.message_count !== undefined || profileData.last_reset !== undefined)) {
              console.log(`Removing denormalized fields from profile for user ${userDocRef.id}...`);

              // Create update object to remove the fields
              const updateData: any = {};
              if (profileData.message_count !== undefined) {
                updateData.message_count = require('firebase-admin').firestore.FieldValue.delete();
              }
              if (profileData.last_reset !== undefined) {
                updateData.last_reset = require('firebase-admin').firestore.FieldValue.delete();
              }

              // Use update only if the document exists and has data
              await privateProfileRef.update(updateData);
              cleanedCount++;
              console.log(`Successfully cleaned profile for user ${userDocRef.id}`);
            } else {
              console.log(`No denormalized fields found in profile for user ${userDocRef.id}`);
            }
          } else {
            console.log(`Profile document doesn't exist for user ${userDocRef.id}`);
          }
        } catch (error) {
          console.error(`Error cleaning up user ${userDocRef.id}:`, error);
          console.error(`Error details:`, error instanceof Error ? error.message : String(error));
        }
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    console.log(`Cleanup complete. Cleaned ${cleanedCount} user profiles.`);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
};

// Check command line arguments to determine which function to run
const args = process.argv.slice(2);
if (args.includes('--cleanup')) {
  console.log('Running cleanup mode...');
  cleanupProfileFields().catch((error) => {
    console.error('Error during cleanup:', error);
    process.exit(1);
  });
} else {
  console.log('Running migration mode...');
  migrateUsers().catch((error) => {
    console.error('Error during migration:', error);
    process.exit(1);
  });
}
