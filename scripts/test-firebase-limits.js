// Test script for Firebase-based message limits functionality
const DAILY_LIMIT = 3;

// Mock Firebase operations
const mockFirebaseData = new Map();

// Mock Firebase functions
const mockDoc = (collection, userId) => ({ collection, userId });
const mockGetDoc = async (docRef) => {
  const key = `${docRef.collection}/${docRef.userId}`;
  const data = mockFirebaseData.get(key);
  return {
    exists: () => !!data,
    data: () => data || null
  };
};
const mockUpdateDoc = async (docRef, updates) => {
  const key = `${docRef.collection}/${docRef.userId}`;
  const existing = mockFirebaseData.get(key) || {};
  mockFirebaseData.set(key, { ...existing, ...updates });
};

// Mock serverTimestamp
const mockServerTimestamp = () => ({
  toDate: () => new Date()
});

// Mock user
const mockUser = { uid: 'test-user-123' };

// Function to simulate loadUsage logic
async function loadUsage(user, userType = 'free') {
  if (!user) return;

  try {
    const userDocRef = mockDoc('users', user.uid);
    const userDoc = await mockGetDoc(userDocRef);

    if (!userDoc.exists()) {
      console.log('📊 User document not found, setting initial state');
      return {
        dailyUsage: 0,
        limit: DAILY_LIMIT,
        isLimitReached: false,
        isNearLimit: false,
        canSendMessage: userType === 'pro',
      };
    }

    const userData = userDoc.data();
    const currentMessageCount = userData?.message_count || 0;
    const lastReset = userData?.last_reset?.toDate();
    const today = new Date();
    const todayString = today.toDateString();

    // Check if we need to reset for a new day
    const shouldReset = !lastReset || lastReset.toDateString() !== todayString;

    let finalMessageCount = currentMessageCount;

    if (shouldReset && currentMessageCount > 0) {
      console.log('📊 Resetting message count for new day');
      // Reset the count and update last_reset
      await mockUpdateDoc(userDocRef, {
        message_count: 0,
        last_reset: mockServerTimestamp()
      });
      finalMessageCount = 0;
    } else if (shouldReset) {
      // Just update last_reset timestamp
      await mockUpdateDoc(userDocRef, {
        last_reset: mockServerTimestamp()
      });
    }

    console.log('📊 loadUsage called:', {
      userId: user.uid,
      currentMessageCount,
      finalMessageCount,
      lastReset: lastReset?.toDateString(),
      today: todayString,
      shouldReset,
      userType
    });

    const isLimitReached = finalMessageCount >= DAILY_LIMIT && userType === 'free';
    const isNearLimit = finalMessageCount >= DAILY_LIMIT * 0.8 && userType === 'free';
    const canSendMessage = userType === 'pro' || !isLimitReached;

    const newState = {
      dailyUsage: finalMessageCount,
      limit: DAILY_LIMIT,
      isLimitReached,
      isNearLimit,
      canSendMessage,
    };

    console.log('📊 loadUsage setting state:', newState);
    return newState;

  } catch (error) {
    console.error('📊 Error loading usage from Firebase:', error);
    // Fallback to safe state
    return {
      dailyUsage: 0,
      limit: DAILY_LIMIT,
      isLimitReached: false,
      isNearLimit: false,
      canSendMessage: userType === 'pro',
    };
  }
}

// Function to simulate incrementUsage logic
async function incrementUsage(user, userType = 'free') {
  if (!user || userType === 'pro') return true; // Pro users have unlimited messages

  try {
    const userDocRef = mockDoc('users', user.uid);
    const userDoc = await mockGetDoc(userDocRef);

    if (!userDoc.exists()) {
      console.log('📊 User document not found during increment, allowing message');
      return true;
    }

    const userData = userDoc.data();
    const currentMessageCount = userData?.message_count || 0;
    const lastReset = userData?.last_reset?.toDate();
    const today = new Date();

    // Check if we need to reset for a new day
    const shouldReset = !lastReset || lastReset.toDateString() !== today.toDateString();

    let effectiveCount = currentMessageCount;
    if (shouldReset && currentMessageCount > 0) {
      effectiveCount = 0; // Reset for new day
    }

    const newUsage = effectiveCount + 1;

    console.log('📊 incrementUsage called:', {
      userId: user.uid,
      currentMessageCount,
      effectiveCount,
      newUsage,
      limit: DAILY_LIMIT,
      shouldReset
    });

    // Check if limit would be exceeded
    if (newUsage > DAILY_LIMIT) {
      console.log('📊 Limit would be exceeded, blocking message');
      return false; // Block the message
    }

    // Update Firebase with atomic increment
    const updateData = {
      message_count: newUsage
    };

    if (shouldReset) {
      updateData.last_reset = mockServerTimestamp();
    }

    await mockUpdateDoc(userDocRef, updateData);
    console.log('📊 Updated Firebase:', { message_count: newUsage, last_reset: shouldReset });

    return true; // Allow the message

  } catch (error) {
    console.error('📊 Error incrementing usage in Firebase:', error);
    // On error, allow the message to avoid blocking users unnecessarily
    return true;
  }
}

// Test the functionality
async function runTests() {
  console.log('🧪 Testing Firebase-based Message Limits...\n');

  // Initialize user data
  mockFirebaseData.set('users/test-user-123', {
    message_count: 0,
    last_reset: mockServerTimestamp()
  });

  console.log('Test 1: Load initial usage');
  let state = await loadUsage(mockUser);
  console.log('Initial state:', state);
  console.log('Firebase data:', mockFirebaseData.get('users/test-user-123'));
  console.log('');

  console.log('Test 2: Send first message');
  const result1 = await incrementUsage(mockUser);
  console.log('Result:', result1 ? '✅ Allowed' : '❌ Blocked');
  console.log('Firebase data:', mockFirebaseData.get('users/test-user-123'));
  console.log('');

  console.log('Test 3: Load usage after first message');
  state = await loadUsage(mockUser);
  console.log('State after first message:', state);
  console.log('');

  console.log('Test 4: Send second message');
  const result2 = await incrementUsage(mockUser);
  console.log('Result:', result2 ? '✅ Allowed' : '❌ Blocked');
  console.log('Firebase data:', mockFirebaseData.get('users/test-user-123'));
  console.log('');

  console.log('Test 5: Send third message');
  const result3 = await incrementUsage(mockUser);
  console.log('Result:', result3 ? '✅ Allowed' : '❌ Blocked');
  console.log('Firebase data:', mockFirebaseData.get('users/test-user-123'));
  console.log('');

  console.log('Test 6: Try to send fourth message (should be blocked)');
  const result4 = await incrementUsage(mockUser);
  console.log('Result:', result4 ? '✅ Allowed' : '❌ Blocked');
  console.log('Firebase data:', mockFirebaseData.get('users/test-user-123'));
  console.log('');

  console.log('Test 7: Pro user should always be allowed');
  const result5 = await incrementUsage(mockUser, 'pro');
  console.log('Result:', result5 ? '✅ Allowed' : '❌ Blocked');
  console.log('Firebase data:', mockFirebaseData.get('users/test-user-123'));
  console.log('');

  console.log('Test 8: Test day reset simulation');
  // Simulate day change by setting old last_reset
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 1);
  mockFirebaseData.set('users/test-user-123', {
    message_count: 2,
    last_reset: { toDate: () => oldDate }
  });

  console.log('Before reset - Firebase data:', mockFirebaseData.get('users/test-user-123'));
  state = await loadUsage(mockUser);
  console.log('State after day reset:', state);
  console.log('After reset - Firebase data:', mockFirebaseData.get('users/test-user-123'));
  console.log('');

  console.log('🎉 Firebase-based tests completed!');
}

runTests().catch(console.error);
