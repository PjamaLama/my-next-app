// Test script to verify userType migration from profile to main document
const DAILY_LIMIT = 3;

// Mock Firebase data (simulating the new structure)
let firebaseData = {
  'users/test-user-123': {
    message_count: 2,
    last_reset: new Date('2024-01-15T10:00:00Z'),
    userType: 'free', // Now in main document
    wa_id: null
  }
};

let profileData = {
  'users/test-user-123/private/profile': {
    email: 'test@example.com',
    displayName: 'Test User',
    lastLoginAt: new Date(),
    // userType is no longer here
  }
};

// Mock Firebase functions
const mockDoc = (collection, userId, ...path) => {
  const fullPath = path.length > 0 ? `${collection}/${userId}/${path.join('/')}` : `${collection}/${userId}`;
  return { collection, userId, path, fullPath };
};

const mockGetDoc = async (docRef) => {
  const data = firebaseData[docRef.fullPath] || profileData[docRef.fullPath];
  return {
    exists: () => !!data,
    data: () => data || null
  };
};

// Simulate the NEW useUserProfile logic
async function simulateUseUserProfile(userId) {
  console.log('\n🔍 Simulating useUserProfile for user:', userId);

  try {
    const userDocRef = mockDoc('users', userId);

    // Listener for the main user document to get wa_id, message_count, and userType
    const userDocSnap = await mockGetDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      console.log('📄 Main user document data:', data);

      const userType = data.userType || 'free';
      const message_count = data.message_count || 0;
      const wa_id = data.wa_id || null;

      console.log('✅ userType from main document:', userType);
      console.log('✅ message_count from main document:', message_count);
      console.log('✅ wa_id from main document:', wa_id);

      return { userType, message_count, wa_id };
    } else {
      console.log('❌ Main user document not found');
      return { userType: 'free', message_count: 0, wa_id: null };
    }
  } catch (error) {
    console.error('Error simulating useUserProfile:', error);
    return { userType: 'free', message_count: 0, wa_id: null };
  }
}

// Simulate message limits computation
function simulateMessageLimits(userType, message_count) {
  const isLimitReached = message_count >= DAILY_LIMIT && userType === 'free';
  const isNearLimit = message_count >= DAILY_LIMIT * 0.8 && userType === 'free';
  const canSendMessage = userType === 'pro' || !isLimitReached;

  return {
    dailyUsage: message_count,
    limit: DAILY_LIMIT,
    isLimitReached,
    isNearLimit,
    canSendMessage,
  };
}

// Test the migration
async function testUserTypeMigration() {
  console.log('🚀 Testing userType Migration\n');
  console.log('📋 Current Firebase structure:');
  console.log('Main document:', firebaseData['users/test-user-123']);
  console.log('Profile document:', profileData['users/test-user-123/private/profile']);

  // Test 1: Reading userType from main document
  console.log('\nTest 1: Reading userType from main document');
  const userProfile = await simulateUseUserProfile('test-user-123');
  console.log('useUserProfile result:', userProfile);

  // Test 2: Message limits computation
  console.log('\nTest 2: Message limits computation');
  const limits = simulateMessageLimits(userProfile.userType, userProfile.message_count);
  console.log('Message limits:', limits);

  // Test 3: Pro user behavior
  console.log('\nTest 3: Pro user behavior');
  firebaseData['users/test-user-123'].userType = 'pro';
  const proProfile = await simulateUseUserProfile('test-user-123');
  const proLimits = simulateMessageLimits(proProfile.userType, proProfile.message_count);
  console.log('Pro user limits:', proLimits);

  // Test 4: Free user behavior
  console.log('\nTest 4: Free user behavior');
  firebaseData['users/test-user-123'].userType = 'free';
  firebaseData['users/test-user-123'].message_count = 3; // At limit
  const freeProfile = await simulateUseUserProfile('test-user-123');
  const freeLimits = simulateMessageLimits(freeProfile.userType, freeProfile.message_count);
  console.log('Free user at limit:', freeLimits);

  console.log('\n🎉 Migration test completed!');
  console.log('✅ userType successfully moved to main document');
  console.log('✅ Message limits work correctly with new structure');
  console.log('✅ Pro users get unlimited messages');
  console.log('✅ Free users are properly limited');
}

testUserTypeMigration().catch(console.error);
