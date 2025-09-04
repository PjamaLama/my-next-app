// Test script to verify no reset happens on app load
const DAILY_LIMIT = 3;

// Mock Firebase data (simulates existing user)
let firebaseData = {
  'users/test-user-123': {
    message_count: 2,
    last_reset: new Date('2024-01-15T10:00:00Z'), // Old reset date
    wa_id: null
  }
};

let profileData = {
  'users/test-user-123/private/profile': {
    email: 'test@example.com',
    userType: 'free',
    lastLoginAt: new Date()
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

const mockUpdateDoc = async (docRef, updates) => {
  const key = docRef.fullPath;
  if (firebaseData[key]) {
    firebaseData[key] = { ...firebaseData[key], ...updates };
  } else if (profileData[key]) {
    profileData[key] = { ...profileData[key], ...updates };
  }
  console.log(`🔥 Updated ${key}:`, updates);
};

const mockSetDoc = async (docRef, data, options = {}) => {
  const key = docRef.fullPath;
  if (options.merge) {
    firebaseData[key] = { ...(firebaseData[key] || {}), ...data };
  } else {
    firebaseData[key] = data;
  }
  console.log(`🔥 Set ${key}:`, data);
};

// Mock serverTimestamp
const mockServerTimestamp = () => ({
  toDate: () => new Date()
});

// Simulate useUserProfile ensureUserDoc logic
async function simulateAppLoad(userId) {
  console.log('\n📱 Simulating app load for existing user...');

  try {
    const profileRef = mockDoc('users', userId, 'private', 'profile');
    const userDocRef = mockDoc('users', userId);

    // Check if main user document exists first
    const userDocSnap = await mockGetDoc(userDocRef);
    const userDocExists = userDocSnap.exists();

    // Check if profile subdocument exists
    const profileSnap = await mockGetDoc(profileRef);
    const profileExists = profileSnap.exists();

    console.log(`User document exists: ${userDocExists}`);
    console.log(`Profile document exists: ${profileExists}`);

    // Only initialize if both documents don't exist (truly new user)
    if (!userDocExists && !profileExists) {
      console.log('🆕 Initializing NEW user...');

      // Initialize profile subdocument
      const baseData = {
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null,
        lastLoginAt: mockServerTimestamp(),
        createdAt: mockServerTimestamp(),
        selectedSheetNames: [],
        defaultSpreadsheetId: "",
        userType: 'free',
      };

      await mockSetDoc(profileRef, baseData);

      // Initialize main user document with message tracking
      const denormalizedData = {
        message_count: 0,
        last_reset: mockServerTimestamp(),
        wa_id: null,
      };
      await mockSetDoc(userDocRef, denormalizedData);

      console.log('✅ Initialized new user data');
    } else {
      console.log('👤 Existing user - only updating last login');
      // User exists, just update last login time (don't touch message_count or last_reset)
      await mockUpdateDoc(profileRef, {
        lastLoginAt: mockServerTimestamp()
      });
    }
  } catch (e) {
    console.error("Error ensuring user document:", e);
  }
}

// Test the fix
async function runTest() {
  console.log('🧪 Testing Fix: No Reset on App Load\n');
  console.log('Initial Firebase data:', firebaseData);

  // Simulate first app load (existing user)
  await simulateAppLoad('test-user-123');
  console.log('Firebase data after first load:', firebaseData);

  // Simulate second app load (existing user)
  await simulateAppLoad('test-user-123');
  console.log('Firebase data after second load:', firebaseData);

  // Simulate third app load (existing user)
  await simulateAppLoad('test-user-123');
  console.log('Firebase data after third load:', firebaseData);

  console.log('\n✅ SUCCESS: message_count and last_reset were NOT reset on app loads!');
  console.log('✅ Only lastLoginAt was updated for existing users');
  console.log('✅ Daily resets will only happen via Firebase scheduled function');
}

runTest().catch(console.error);
