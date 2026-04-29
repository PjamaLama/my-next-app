# Sheety AI - Next.js Application

Demo site : https://www.sheetyai.com/

A Next.js application for AI-powered Google Sheets automation and chat-driven updates.

## Features

- AI-powered document analysis and data extraction
- Google Sheets integration for data management
- Voice recording and transcription
- PWA support for mobile devices
- Real-time data synchronization
- Centralized ingestion pipeline with de-duplication and idempotency

## AI Error Handling Improvements

### Problem
The application was experiencing frequent 503 "Service Unavailable" errors from the Gemini API due to model overload. This was causing:
- Failed file analysis operations
- Interrupted data extraction workflows
- Poor user experience with repeated failures

### Solution
Implemented comprehensive error handling and retry mechanisms:

#### 1. Enhanced Retry Strategy
- **Increased retry attempts**: From 3 to 5 attempts
- **Longer delays**: Base delay increased from 1s to 2s, max delay from 10s to 30s
- **Better backoff**: Multiplier increased from 2 to 2.5 for more aggressive retry

#### 2. Request Throttling
- **Rate limiting**: 1.5-second minimum interval between requests
- **Prevents API overload**: Reduces the chance of hitting rate limits
- **Automatic throttling**: Built into all AI operations

#### 3. Model Fallback Strategy
- **Multiple models**: Uses both Gemini 1.5 Flash and Gemini 1.5 Pro
- **Automatic fallback**: If one model is overloaded, tries the next
- **Improved reliability**: Higher success rate for AI operations

#### 4. Better Error Detection
- **Enhanced patterns**: Detects more overload-related error messages
- **Specific handling**: Different responses for different error types
- **User-friendly messages**: Clear explanations of what went wrong

### Configuration
The retry configuration can be adjusted in `lib/aiUtils.ts`:

```typescript
const defaultRetryConfig: RetryConfig = {
  maxRetries: 5,           // Number of retry attempts
  baseDelay: 2000,         // Initial delay in milliseconds
  maxDelay: 30000,         // Maximum delay in milliseconds
  backoffMultiplier: 2.5   // Exponential backoff multiplier
};
```

### Usage
All AI operations automatically use the improved error handling:

```typescript
import { executeAIWithRetry, executeAIWithModelFallback } from './lib/aiUtils';

// Single model with retry
const result = await executeAIWithRetry(
  () => aiModel.generate(prompt),
  'Document analysis'
);

// Multiple models with fallback
const operations = [
  () => model1.generate(prompt),
  () => model2.generate(prompt)
];
const result = await executeAIWithModelFallback(operations, 'Analysis');
```

## Getting Started

### Prerequisites
- Node.js 18+ 
- Google Cloud Project with Gemini API enabled
- Google Sheets API credentials

### Installation
```bash
npm install
```

### Environment Variables
Create a `.env.local` file:
```env
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Microsoft Clarity Analytics (Optional)
NEXT_PUBLIC_CLARITY_PROJECT_ID=your_clarity_project_id_here
NEXT_PUBLIC_CLARITY_ENABLED=true
NEXT_PUBLIC_CLARITY_DEBUG=false
```

### Microsoft Clarity Setup
Microsoft Clarity has been installed to track user behavior and page visits. To set it up:

1. **Get your Clarity Project ID**:
   - Visit [Microsoft Clarity](https://clarity.microsoft.com/)
   - Create a new project for your website
   - Copy the Project ID from the setup code

2. **Configure Environment Variables**:
   - Add `NEXT_PUBLIC_CLARITY_PROJECT_ID` to your `.env.local` file
   - Set `NEXT_PUBLIC_CLARITY_ENABLED=true` to enable tracking (disabled in development by default)
   - Set `NEXT_PUBLIC_CLARITY_DEBUG=true` for debug logging in development

3. **Features Available**:
   - Session recordings and heatmaps
   - User click tracking and rage clicks
   - Page view analytics
   - Custom event tracking via `clarityAnalytics.trackEvent()`
   - User identification and session upgrades

4. **Usage in Code**:
   ```typescript
   import { clarityAnalytics } from '@/lib/analytics/microsoftClarity';

   // Track custom events (properties will be set as tags)
   clarityAnalytics.trackEvent('button_clicked', { button: 'submit' });

   // Identify users (if you have user IDs)
   clarityAnalytics.identify(customerId, sessionId, pageId, friendlyName);

   // Set custom tags
   clarityAnalytics.setTag('user_type', 'premium');

   // Upgrade important sessions
   clarityAnalytics.upgrade('high_value_user');
   ```

### Development
```bash
npm run dev
```

### Testing
```bash
npm test
```

## Architecture

- **Frontend**: Next.js 14 with App Router
- **AI**: Google Gemini API via Genkit
- **Database**: Google Sheets + Firestore
- **Authentication**: Firebase Auth
- **Deployment**: Vercel/Netlify ready

### Ingestion Orchestration

- API: `POST /api/ingest-rows` with `{ spreadsheetId, sheetNames: string[], rows: Array<Record<string, unknown>>, dryRun?: boolean }`.
- Library: `lib/ingestion/orchestrator.ts` exports `ingestRows`.
- Config: `lib/sheetConfig.ts` allows per-sheet `primaryKeys`, `required`, `types`, `synonyms`, `mergePolicy`.
- Genkit routes `extract_data_from_files/images` and `apply_structured_rows` call this endpoint to ensure consistent mapping, de-duplication, and updates.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
