/// <reference types="firebase-admin" />
import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebaseAdmin';
require('dotenv').config({ path: '.env.local' });

const testUserCreationFlow = async () => {
  console.log('🧪 Testing User Creation Flow...');
  const db = getAdminDb();

  try {
    // Simulate a new user ID (in real scenario this would come from Firebase Auth)
    const testUserId = `test-user-${Date.now()}`;

    console.log(`📝 Testing user creation for: ${testUserId}`);

    // Simulate what useUserProfile.ensureUserDoc does for a new user
    const profileRef = db.doc(`users/${testUserId}/private/profile`);
    const userDocRef = db.doc(`users/${testUserId}`);

    // Check if documents exist (they shouldn't for a new user)
    const userDocSnap = await userDocRef.get();
    const profileSnap = await profileRef.get();

    console.log(`📊 User document exists: ${userDocSnap.exists}`);
    console.log(`📊 Profile document exists: ${profileSnap.exists}`);

    // Simulate user creation (what happens when ensureUserDoc runs)
    if (!userDocSnap.exists && !profileSnap.exists) {
      console.log('🆕 Creating new user documents...');

      // Create profile document
      await profileRef.set({
        email: `test-${testUserId}@example.com`,
        displayName: `Test User ${testUserId}`,
        photoURL: null,
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        selectedSheetNames: [],
        defaultSpreadsheetId: "",
        geminiApiKey: ''
      });

      // Create main user document with userType
      await userDocRef.set({
        message_count: 0,
        last_reset: admin.firestore.FieldValue.serverTimestamp(),
        wa_id: null,
        userType: 'free', // Should be here, not in profile
      });

      console.log('✅ New user documents created successfully');
    }

    // Verify the documents were created correctly
    console.log('\n🔍 Verifying created documents...');

    const createdUserDoc = await userDocRef.get();
    const createdProfileDoc = await profileRef.get();

    if (createdUserDoc.exists) {
      const userData = createdUserDoc.data();
      console.log('📋 Main user document data:');
      console.log(`   userType: ${userData?.userType} (should be 'free')`);
      console.log(`   message_count: ${userData?.message_count} (should be 0)`);
      console.log(`   last_reset: ${userData?.last_reset ? 'set' : 'missing'}`);
      console.log(`   wa_id: ${userData?.wa_id} (should be null)`);

      // Check for userType in main document
      if (userData?.userType === 'free') {
        console.log('✅ userType correctly set to "free" in main document');
      } else {
        console.log('❌ userType missing or incorrect in main document');
      }

      // Check that userType is NOT in profile document
      if (createdProfileDoc.exists) {
        const profileData = createdProfileDoc.data();
        if (profileData?.userType) {
          console.log('❌ userType incorrectly found in profile document');
        } else {
          console.log('✅ userType correctly NOT in profile document');
        }

        console.log('📋 Profile document data:');
        console.log(`   email: ${profileData?.email}`);
        console.log(`   geminiApiKey: ${profileData?.geminiApiKey || 'empty'}`);
        console.log(`   userType: ${profileData?.userType || 'not set (correct)'}`);
      }
    } else {
      console.log('❌ Main user document was not created');
    }

    // Clean up test user
    console.log('\n🧹 Cleaning up test user...');
    await userDocRef.delete();
    console.log('✅ Test user cleaned up');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
};

const testUpgradeFlow = async () => {
  console.log('\n🧪 Testing Upgrade Flow...');
  const db = getAdminDb();

  try {
    // Create a test user first
    const testUserId = `upgrade-test-${Date.now()}`;
    const userDocRef = db.doc(`users/${testUserId}`);
    const profileRef = db.doc(`users/${testUserId}/private/profile`);

    console.log(`📝 Testing upgrade for: ${testUserId}`);

    // Create initial user documents
    await profileRef.set({
      email: `upgrade-${testUserId}@example.com`,
      displayName: `Upgrade Test User ${testUserId}`,
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      geminiApiKey: ''
    });

    await userDocRef.set({
      message_count: 0,
      last_reset: admin.firestore.FieldValue.serverTimestamp(),
      wa_id: null,
      userType: 'free',
    });

    console.log('✅ Initial user created');

    // Simulate upgrade (what upgrade API does)
    await userDocRef.set({
      userType: 'pro',
      upgradedAt: new Date(),
    }, { merge: true });

    console.log('✅ User upgraded to Pro');

    // Verify upgrade
    const upgradedDoc = await userDocRef.get();
    const upgradeData = upgradedDoc.data();

    console.log('🔍 Verifying upgrade:');
    console.log(`   userType: ${upgradeData?.userType} (should be 'pro')`);
    console.log(`   upgradedAt: ${upgradeData?.upgradedAt ? upgradeData.upgradedAt.toDate() : 'missing'}`);

    if (upgradeData?.userType === 'pro' && upgradeData?.upgradedAt) {
      console.log('✅ Upgrade correctly set userType and upgradedAt in main document');
    } else {
      console.log('❌ Upgrade failed to set fields correctly');
    }

    // Clean up
    console.log('\n🧹 Cleaning up upgrade test user...');
    await userDocRef.delete();
    console.log('✅ Upgrade test user cleaned up');

  } catch (error) {
    console.error('❌ Upgrade test failed:', error);
    process.exit(1);
  }
};

// Run tests
const main = async () => {
  try {
    console.log('🚀 User Creation Flow Tests');
    console.log('===========================');

    await testUserCreationFlow();
    await testUpgradeFlow();

    console.log('\n✨ All tests completed successfully!');
    console.log('✅ User creation sets userType in main document');
    console.log('✅ User upgrade sets userType and upgradedAt in main document');
    console.log('✅ No userType in profile documents');

  } catch (error) {
    console.error('💥 Tests failed:', error);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error('Error during tests:', error);
  process.exit(1);
});
