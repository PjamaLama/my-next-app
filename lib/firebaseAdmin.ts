import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Helper function to properly format private key from environment variable
const formatPrivateKey = (rawKey: string): string => {
  if (!rawKey) return '';
  
  // Remove any surrounding quotes
  let key = rawKey.trim().replace(/^["']|["']$/g, '');
  
  // Handle various newline formats that can occur when copying from JSON
  // Replace literal \n with actual newlines
  key = key.replace(/\\n/g, '\n');
  
  // If the key doesn't start with -----BEGIN PRIVATE KEY-----,
  // it might be missing the header/footer or have wrong formatting
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    // Try to reconstruct the key if it's just the base64 content
    if (key.length > 100 && !key.includes('-----')) {
      key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
    } else if (key.length < 1000) {
      // Key is too short - this usually means it got truncated
      throw new Error(`Private key appears to be truncated. Expected ~1700+ characters, got ${key.length}. Please check your environment variable.`);
    }
  }
  
  // Validate the key format
  if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing BEGIN/END markers. Please check your environment variable.');
  }
  
  // Check if the key content looks reasonable
  const keyContent = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '').replace(/\n/g, '');
  if (keyContent.length < 1000) {
    throw new Error(`Private key content appears to be truncated. Expected ~1000+ characters of base64 content, got ${keyContent.length}. Please check your environment variable.`);
  }
  
  return key;
};

export const getAdminDb = () => {
  if (!getApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (clientEmail && rawPrivateKey) {
      const privateKey = formatPrivateKey(rawPrivateKey);
      
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid private key format: missing BEGIN/END markers');
      }
      
      initializeApp({
        credential: cert({
          projectId: projectId || undefined,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      // Fallback to Application Default Credentials (supports GOOGLE_APPLICATION_CREDENTIALS)
      initializeApp({
        credential: applicationDefault(),
        projectId: projectId || undefined,
      });
    }
  }

  return getFirestore();
};

export const getAdminAuth = () => {
  if (!getApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (clientEmail && rawPrivateKey) {
      const privateKey = formatPrivateKey(rawPrivateKey);
      
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid private key format: missing BEGIN/END markers');
      }
      
      initializeApp({
        credential: cert({
          projectId: projectId || undefined,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      // Fallback to Application Default Credentials (supports GOOGLE_APPLICATION_CREDENTIALS)
      initializeApp({
        credential: applicationDefault(),
        projectId: projectId || undefined,
      });
    }
  }

  return getAuth();
};


