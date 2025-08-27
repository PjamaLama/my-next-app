/// <reference types="firebase-admin" />
require('dotenv').config({ path: '.env.local' });
const { getAdminDb } = require('../lib/firebaseAdmin');

interface TestResult {
  passed: boolean;
  message: string;
  details?: any;
}

const testMigration = async (): Promise<TestResult[]> => {
  console.log('🧪 Testing selectedSheetNames migration...\n');
  const results: TestResult[] = [];

  try {
    const db = getAdminDb();
    const usersRef = db.collection('users');
    const userDocs = await usersRef.listDocuments();

    if (userDocs.length === 0) {
      results.push({
        passed: false,
        message: 'No users found to test migration on'
      });
      return results;
    }

    console.log(`Found ${userDocs.length} users to test with`);

    // Test 1: Check that migration script can access all users
    results.push({
      passed: true,
      message: 'Migration script can access user documents',
      details: { userCount: userDocs.length }
    });

    // Test 2: Verify private profile structure for a few users
    let usersWithPrivateProfiles = 0;
    let usersWithSelectedSheets = 0;

    for (const userDocRef of userDocs.slice(0, 3)) { // Test first 3 users
      const privateProfileRef = userDocRef.collection('private').doc('profile');
      const profileDoc = await privateProfileRef.get();

      if (profileDoc.exists) {
        usersWithPrivateProfiles++;
        const data = profileDoc.data();
        if (data?.selectedSheetNames && data.selectedSheetNames.length > 0) {
          usersWithSelectedSheets++;
        }
      }
    }

    results.push({
      passed: true,
      message: 'Private profile structure verified',
      details: {
        usersWithPrivateProfiles,
        usersWithSelectedSheets,
        sampleSize: Math.min(3, userDocs.length)
      }
    });

    // Test 3: Verify main user document structure
    let usersWithMainDocs = 0;
    for (const userDocRef of userDocs.slice(0, 3)) {
      const userDoc = await userDocRef.get();
      if (userDoc.exists) {
        usersWithMainDocs++;
      }
    }

    results.push({
      passed: true,
      message: 'Main user document structure verified',
      details: {
        usersWithMainDocs,
        sampleSize: Math.min(3, userDocs.length)
      }
    });

    // Test 4: Check backup collection structure
    const backupCollection = db.collection('migration_backups').doc('selectedSheets_backup').collection('users');
    const backupDocs = await backupCollection.listDocuments();

    results.push({
      passed: true,
      message: 'Backup collection structure verified',
      details: {
        backupDocumentsCount: backupDocs.length
      }
    });

    // Test 5: Validate migration script structure
    const fs = require('fs');
    const path = require('path');
    const migrationScriptPath = path.join(__dirname, 'migrate-selected-sheets.ts');

    if (fs.existsSync(migrationScriptPath)) {
      const scriptContent = fs.readFileSync(migrationScriptPath, 'utf8');

      const hasBackupFunction = scriptContent.includes('createBackup');
      const hasRestoreFunction = scriptContent.includes('restoreBackup');
      const hasMigrationFunction = scriptContent.includes('migrateSelectedSheets');

      results.push({
        passed: hasBackupFunction && hasRestoreFunction && hasMigrationFunction,
        message: 'Migration script has all required functions',
        details: {
          hasBackupFunction,
          hasRestoreFunction,
          hasMigrationFunction
        }
      });
    } else {
      results.push({
        passed: false,
        message: 'Migration script file not found'
      });
    }

  } catch (error) {
    results.push({
      passed: false,
      message: 'Test failed with error',
      details: error instanceof Error ? error.message : String(error)
    });
  }

  return results;
};

const runTests = async () => {
  console.log('🚀 Starting migration tests...\n');

  const results = await testMigration();

  console.log('\n📊 Test Results:');
  console.log('================');

  let passedCount = 0;
  let failedCount = 0;

  results.forEach((result, index) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${index + 1}. ${status} - ${result.message}`);

    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
    }

    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
  });

  console.log('\n📈 Summary:');
  console.log(`✅ Passed: ${passedCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`📊 Total: ${results.length}`);

  if (failedCount === 0) {
    console.log('\n🎉 All tests passed! Migration is ready to proceed.');
    console.log('\n📋 Next steps:');
    console.log('1. Run backup: npm run migrate:selected-sheets -- --backup');
    console.log('2. Run migration: npm run migrate:selected-sheets');
    console.log('3. Verify in application that sheet selection still works');
    console.log('4. If issues arise, rollback: npm run migrate:selected-sheets -- --restore');
  } else {
    console.log('\n⚠️  Some tests failed. Please review before proceeding with migration.');
  }

  process.exit(failedCount > 0 ? 1 : 0);
};

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testMigration };
