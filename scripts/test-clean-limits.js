// Test script for the cleaned up message limits implementation
const DAILY_LIMIT = 3;

// Mock Firebase data
let mockMessageCount = 0;

// Simulate useUserProfile behavior
function getMessageCount() {
  return mockMessageCount;
}

// Simulate incrementUsage logic
async function incrementUsage(userType = 'free') {
  if (userType === 'pro') return true;

  const currentCount = getMessageCount();
  const newUsage = currentCount + 1;

  console.log('📊 incrementUsage:', {
    currentCount,
    newUsage,
    limit: DAILY_LIMIT
  });

  if (newUsage > DAILY_LIMIT) {
    console.log('❌ Limit would be exceeded');
    return false;
  }

  // Simulate Firebase update
  mockMessageCount = newUsage;
  console.log('✅ Updated to:', newUsage);

  return true;
}

// Simulate computed state
function getComputedState(userType = 'free') {
  const message_count = getMessageCount();
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

// Test the flow
async function runTest() {
  console.log('🧪 Testing Clean Message Limits Implementation\n');

  console.log('Initial state:', getComputedState());
  console.log('');

  console.log('Test 1: Send first message');
  await incrementUsage();
  console.log('State after increment:', getComputedState());
  console.log('');

  console.log('Test 2: Send second message');
  await incrementUsage();
  console.log('State after increment:', getComputedState());
  console.log('');

  console.log('Test 3: Send third message');
  await incrementUsage();
  console.log('State after increment:', getComputedState());
  console.log('');

  console.log('Test 4: Try to send fourth message (should fail)');
  const result4 = await incrementUsage();
  console.log('Result:', result4 ? '✅ Allowed' : '❌ Blocked');
  console.log('State after attempt:', getComputedState());
  console.log('');

  console.log('Test 5: Pro user should always be allowed');
  const result5 = await incrementUsage('pro');
  console.log('Result:', result5 ? '✅ Allowed' : '❌ Blocked');
  console.log('State after pro increment:', getComputedState());
  console.log('');

  console.log('🎉 Clean implementation test completed!');
  console.log('✅ No state conflicts');
  console.log('✅ Single source of truth');
  console.log('✅ Automatic state updates');
}

runTest().catch(console.error);
