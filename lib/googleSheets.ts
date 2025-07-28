import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export const getGoogleSheetsClient = async (retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔐 Attempting Google Sheets authentication (attempt ${attempt}/${retries})`);
      
      const client = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: SCOPES,
      });

      // Add timeout for authorization
      const authPromise = client.authorize();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Authentication timeout after 10 seconds')), 10000)
      );

      await Promise.race([authPromise, timeoutPromise]);
      console.log(`✅ Google Sheets authentication successful on attempt ${attempt}`);

      const sheets = google.sheets({ version: 'v4', auth: client });
      return sheets;
      
    } catch (error) {
      console.error(`❌ Authentication attempt ${attempt} failed:`, error);
      
      if (attempt === retries) {
        console.error(`🚫 All ${retries} authentication attempts failed`);
        throw new Error(`Google Sheets authentication failed after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error('This should never be reached');
}; 