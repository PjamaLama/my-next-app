// Test script for message limits functionality
const DAILY_LIMIT = 3;

// Simulate localStorage for testing
const mockStorage = {};

// Mock localStorage functions
const localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; }
};

// Mock user
const mockUser = { uid: 'test-user-123' };

// Function to simulate incrementUsage logic
function incrementUsage(user, userType = 'free') {
  if (!user || userType === 'pro') return true; // Pro users have unlimited messages

  const today = new Date().toDateString();
  const storageKey = `sheetyai_messages_${user.uid}_${today}`;

  const currentUsage = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const newUsage = currentUsage + 1;

  console.log('📊 incrementUsage called:', {
    userId: user.uid,
    currentUsage,
    newUsage,
    limit: DAILY_LIMIT
  });

  // Check if limit would be exceeded
  if (newUsage > DAILY_LIMIT) {
    console.log('📊 Limit would be exceeded, blocking message');
    return false; // Block the message
  }

  // Update storage
  localStorage.setItem(storageKey, newUsage.toString());
  console.log('📊 Updated localStorage:', { storageKey, newUsage });

  return true; // Allow the message
}

// Test the functionality
console.log('🧪 Testing Message Limits...\n');

console.log('Test 1: Send first message');
const result1 = incrementUsage(mockUser);
console.log('Result:', result1 ? '✅ Allowed' : '❌ Blocked');
console.log('Storage:', mockStorage);
console.log('');

console.log('Test 2: Send second message');
const result2 = incrementUsage(mockUser);
console.log('Result:', result2 ? '✅ Allowed' : '❌ Blocked');
console.log('Storage:', mockStorage);
console.log('');

console.log('Test 3: Send third message');
const result3 = incrementUsage(mockUser);
console.log('Result:', result3 ? '✅ Allowed' : '❌ Blocked');
console.log('Storage:', mockStorage);
console.log('');

console.log('Test 4: Try to send fourth message (should be blocked)');
const result4 = incrementUsage(mockUser);
console.log('Result:', result4 ? '✅ Allowed' : '❌ Blocked');
console.log('Storage:', mockStorage);
console.log('');

console.log('Test 5: Pro user should always be allowed');
const result5 = incrementUsage(mockUser, 'pro');
console.log('Result:', result5 ? '✅ Allowed' : '❌ Blocked');
console.log('Storage:', mockStorage);
console.log('');

console.log('🎉 Test completed!');
