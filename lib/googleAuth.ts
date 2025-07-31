import { JWT } from 'google-auth-library';

// Helper function to get Google Cloud credentials
export const getGoogleCredentials = () => {
  // For production (Vercel) - use environment variables
  if (process.env.GOOGLE_PRIVATE_KEY) {
    return {
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }
  
  // For local development - use JSON file
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Let Google Auth Library handle the JSON file automatically
    return {
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    };
  }
  
  throw new Error('No Google Cloud credentials found. Please set GOOGLE_PRIVATE_KEY for production or GOOGLE_APPLICATION_CREDENTIALS for development.');
}; 