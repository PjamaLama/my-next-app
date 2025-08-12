import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const getAdminDb = () => {
  if (!getApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (clientEmail && rawPrivateKey) {
      const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
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


