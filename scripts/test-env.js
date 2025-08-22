#!/usr/bin/env node

/**
 * Test script to check environment variables for Google Service Account
 * 
 * Usage: node scripts/test-env.js
 */

console.log('🔍 Testing Google Service Account Environment Variables');
console.log('=====================================================');
console.log('');

// Check if we're in a Node.js environment
if (typeof process === 'undefined') {
  console.log('❌ This script must be run in Node.js');
  process.exit(1);
}

// Check required environment variables
const requiredVars = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY'
];

console.log('📋 Checking required environment variables:');
console.log('');

let allPresent = true;

for (const varName of requiredVars) {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: Present (${value.length} chars)`);
    
    // Special handling for private key
    if (varName === 'GOOGLE_PRIVATE_KEY') {
      if (value.length < 1000) {
        console.log(`   ⚠️  WARNING: Private key seems too short! Expected ~1700+ characters`);
        allPresent = false;
      }
      
      if (!value.includes('-----BEGIN PRIVATE KEY-----')) {
        console.log(`   ❌ ERROR: Private key missing BEGIN marker`);
        allPresent = false;
      }
      
      if (!value.includes('-----END PRIVATE KEY-----')) {
        console.log(`   ❌ ERROR: Private key missing END marker`);
        allPresent = false;
      }
      
      if (value.includes('\\n')) {
        console.log(`   ℹ️  INFO: Private key contains escaped newlines (\\n)`);
      }
      
      if (value.includes('\n')) {
        console.log(`   ℹ️  INFO: Private key contains actual newlines`);
      }
      
      console.log(`   📝 Sample: ${value.substring(0, 100)}...`);
    }
  } else {
    console.log(`❌ ${varName}: Missing`);
    allPresent = false;
  }
}

console.log('');

if (allPresent) {
  console.log('🎉 All environment variables are present and appear to be valid!');
  console.log('');
  console.log('💡 If you\'re still getting authentication errors, try:');
  console.log('   1. Restart your development server');
  console.log('   2. Check if your system supports the newline format');
  console.log('   3. Use the format-private-key.js script to regenerate the key');
} else {
  console.log('❌ Some environment variables are missing or invalid!');
  console.log('');
  console.log('🔧 To fix this:');
  console.log('   1. Make sure you have a .env.local file or environment variables set');
  console.log('   2. Use the format-private-key.js script to properly format your private key');
  console.log('   3. Check that the values are not truncated');
  console.log('');
  console.log('📖 See README.md for setup instructions');
}

console.log('');
