# Firebase Setup for Migration Script

## Required Environment Variables

Create a `.env` file in your project root with:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id

# Firebase Admin Credentials (for server-side operations)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----"
```

## How to Get Firebase Credentials

### Step 1: Go to Firebase Console
1. Visit https://console.firebase.google.com/
2. Select your project

### Step 2: Create Service Account
1. Click the gear icon → Project settings
2. Go to "Service accounts" tab
3. Click "Generate new private key"
4. Download the JSON file

### Step 3: Extract Credentials
From the downloaded JSON file, copy:
- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` for line breaks)

### Step 4: Alternative - Service Account Key File
Instead of environment variables, you can set:
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/downloaded/serviceAccountKey.json
```

## Running the Migration

Once credentials are set up:

```bash
# From project root
node scripts/migrate-userType-to-main-doc.js
```

## Safety Notes

- ⚠️ **Backup your Firestore data first!**
- The migration is **safe** - it won't overwrite existing data
- Run this **only once** after deploying the updated code
- Test with the demo script first: `node scripts/test-migration.js`
