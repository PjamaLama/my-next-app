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
          if (profileDoc.exists) {
            console.log(`Updating user ${userDocRef.id} (existing profile)...`);
            await privateProfileRef.update({
              message_count: 0,
              last_reset: lastResetDate,
            });
            updatedCount++;
            console.log(`Successfully updated user ${userDocRef.id}`);
          } else {
            console.log(`Creating profile for user ${userDocRef.id} (no existing profile found)...`);
            await privateProfileRef.set({
              message_count: 0,
              last_reset: lastResetDate,
            });
            updatedCount++;
            console.log(`Successfully created profile for user ${userDocRef.id}`);
          }
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

migrateUsers().catch((error) => {
  console.error('Error during migration:', error);
  process.exit(1);
});
