This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

For development or deployment, you can set up environment variables:

1. Create a `.env.local` file in the project root
2. Add the following variables:
   ```
   # Default Gemini API Key (optional fallback)
   GEMINI_API_KEY=your_default_gemini_api_key_here
   
   # Google Service Account credentials
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
   ```

Note: Even with a default API key set, users should still add their own API keys in the app settings for security and usage tracking purposes.

## API Keys and Authentication

### Gemini API Key

Each user must add their own Google Gemini API key in the application settings. This key is securely stored in Firebase for each user and is not shared across users. To set up:

1. Sign in to the application
2. Click on the settings icon in the navigation bar
3. Enter your Gemini API key in the settings modal
4. Click "Save API Key"

### Google Sheets Access

To connect your Google Sheets:

1. Make sure your Google Sheet is shared with the service account email (displayed in the app when adding a spreadsheet)
2. Follow these steps to share your Google Sheet:
   - Open your Google Sheet
   - Click the "Share" button in the top right
   - Enter the service account email address shown in the app
   - Set permission to "Editor"
   - Click "Share"
3. After sharing, add the spreadsheet link in the navigation bar dropdown

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
