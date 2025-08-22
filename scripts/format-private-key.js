#!/usr/bin/env node

/**
 * Utility script to format Google Service Account private key for environment variables
 * 
 * ⚠️  SECURITY WARNING: This script processes sensitive private key data.
 *     - Only run this script on your local machine
 *     - Never commit the output to version control
 *     - Clear your terminal history after use if needed
 * 
 * Usage:
 * 1. Copy your service account JSON file content
 * 2. Run: node scripts/format-private-key.js
 * 3. Paste the JSON content when prompted
 * 4. Copy the formatted output to your environment variable
 * 5. Clear terminal history if needed: history -c
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔑 Google Service Account Private Key Formatter');
console.log('==============================================');
console.log('');
console.log('⚠️  SECURITY WARNING: This script processes sensitive private key data.');
console.log('    - Only run this script on your local machine');
console.log('    - Never commit the output to version control');
console.log('    - Clear your terminal history after use if needed');
console.log('');
console.log('This script will help you format your private key for environment variables.');
console.log('Paste your service account JSON file content below:');
console.log('');

rl.question('Paste JSON content: ', (input) => {
  try {
    const jsonData = JSON.parse(input);
    
    if (!jsonData.private_key) {
      console.error('❌ No private_key found in the JSON data');
      console.log('Available keys:', Object.keys(jsonData));
      rl.close();
      return;
    }
    
    const privateKey = jsonData.private_key;
    
    console.log('');
    console.log('✅ Private key extracted successfully!');
    console.log('');
    console.log('🔍 Key analysis:');
    console.log(`- Length: ${privateKey.length} characters`);
    console.log(`- Starts with: ${privateKey.substring(0, 50)}...`);
    console.log(`- Ends with: ...${privateKey.substring(privateKey.length - 50)}`);
    console.log(`- Has headers: ${privateKey.includes('-----BEGIN PRIVATE KEY-----') && privateKey.includes('-----END PRIVATE KEY-----')}`);
    console.log(`- Has newlines: ${privateKey.includes('\n')}`);
    console.log('');
    
    if (privateKey.length < 1000) {
      console.log('⚠️  WARNING: Private key seems too short! Expected ~1700+ characters.');
      console.log('   This might indicate the key was truncated during copying.');
    }
    
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      console.log('⚠️  WARNING: Private key is missing BEGIN/END markers!');
      console.log('   This will cause authentication errors.');
    }
    
    console.log('📋 Copy this to your environment variable GOOGLE_PRIVATE_KEY:');
    console.log('');
    console.log('GOOGLE_PRIVATE_KEY="' + privateKey + '"');
    console.log('');
    console.log('💡 Note: Make sure to include the quotes around the value');
    console.log('');
    console.log('🔧 Alternative formats you can try:');
    console.log('');
    console.log('1. With escaped newlines (recommended for most systems):');
    console.log('GOOGLE_PRIVATE_KEY="' + privateKey.replace(/\n/g, '\\n') + '"');
    console.log('');
    console.log('2. Single line (if your system doesn\'t handle newlines well):');
    console.log('GOOGLE_PRIVATE_KEY="' + privateKey.replace(/\n/g, '') + '"');
    console.log('');
    console.log('🔒 SECURITY REMINDER:');
    console.log('   - Clear terminal history: history -c');
    console.log('   - Never commit environment files to git');
    console.log('   - Use .env.local for local development');
    
    rl.close();
  } catch (error) {
    console.error('❌ Invalid JSON format:', error.message);
    console.log('');
    console.log('💡 Make sure you copied the entire JSON file content, including the curly braces {}');
    rl.close();
  }
});
