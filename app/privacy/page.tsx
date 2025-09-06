import Link from "next/link";
import React from "react";

export default function PrivacyPolicyPage() {
  const lastUpdated = "2025-08-11";
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-white/90">
      <h1 className="text-3xl font-extrabold mb-2">Privacy Policy</h1>
      <p className="text-sm text-white/60 mb-8">Last updated: {lastUpdated}</p>

      <p className="mb-6">
        This Privacy Policy describes how <strong>Sheety AI</strong> ("we", "us", or "our")
        collects, uses, and shares information when you use our website and services
        (the "Service"). It reflects how this application actually works based on our
        current code and integrations.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">What we do</h2>
      <p className="mb-6">
        Sheety AI helps you analyze documents and update Google Sheets using AI prompts.
        You can sign in with Google, chat with the assistant, optionally upload images or
        PDFs for extraction, and write structured data into your Google Sheets.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">Information we collect</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>
          <strong>Account information (Google Sign‑In):</strong> We receive your Google UID,
          email address, display name, and profile photo from Firebase Authentication to
          create and maintain your account and sign you in.
        </li>
        <li>
          <strong>Profile and usage metadata:</strong> We store basic profile details and
          usage timestamps in Firestore (e.g., user profile under
          <code className="mx-1">users/&lt;uid&gt;/private/profile</code>; recent activity and chat session metadata).
        </li>
        <li>
          <strong>Chat content:</strong> Messages you send and AI responses may be stored in
          Firestore under your chat sessions to provide conversation history.
        </li>
        <li>
          <strong>Uploads you choose to send (images and PDFs only):</strong> Files are validated
          client‑side (8MB per file, 20MB total) and sent as base64 to our API solely for text/data
          extraction. We do not persist original files after processing; only derived text/structured
          results needed to fulfill your request may be kept (e.g., in chat history or written to your Sheet).
        </li>
        <li>
          <strong>Google Sheets data you connect:</strong> We access your specified spreadsheets
          using a Google Cloud service account with the
          <code className="mx-1">spreadsheets</code> scope, to read/write the ranges needed to complete your
          requests. We do not use your Sheets data for advertising or model training.
        </li>
        <li>
          <strong>Feedback:</strong> When you submit feedback, we store the content and your user identifier.
          Basic server logs may include IP/date/time for security and abuse prevention.
        </li>
        <li>
          <strong>Local/session storage:</strong> We store your last Google email/name/photo in
          <code className="mx-1">localStorage</code> for a smoother sign‑in and use a short‑lived
          <code className="mx-1">sessionStorage</code> flag during redirect sign‑in. Firebase Auth uses browser
          persistence for your session.
        </li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">How we use information</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>Authenticate you and maintain your session.</li>
        <li>Provide the Service, including AI‑assisted analysis and updates to your Google Sheets.</li>
        <li>Show conversation history and recent activity to you.</li>
        <li>Detect, prevent, and respond to abuse or technical issues.</li>
        <li>Improve reliability (e.g., retries/fallbacks when an AI model is overloaded).</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">AI providers and data sent to them</h2>
      <p className="mb-6">
        We call Google’s Gemini models via Genkit to generate responses and extract information. The
        prompts, relevant chat context, and any extracted text for the task may be sent to Google’s AI APIs
        to fulfill your request. We do not allow AI providers to use your data for their own advertising;
        processing is only to provide the requested functionality.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">Third parties we use</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li><strong>Google Firebase</strong> (Authentication, Firestore database)</li>
        <li><strong>Google Sheets API</strong> (read/write your selected spreadsheets)</li>
        <li><strong>Google Gemini via Genkit</strong> (AI model inference)</li>
        <li><strong>Google Analytics 4</strong> (website analytics and user behavior insights)</li>
        <li><strong>Microsoft Clarity</strong> (session recordings and heatmaps for UX improvement)</li>
        <li><strong>Meta Pixel</strong> (Facebook advertising conversion tracking)</li>
        <li><strong>Hosting provider</strong> (e.g., Vercel or equivalent) for running the Service</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">Data retention</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>Account data persists while your account is active.</li>
        <li>Chat sessions persist until you delete them in the app; feedback items persist until resolved or removed.</li>
        <li>Uploaded files are processed transiently and not stored after extraction; derived results may remain in chat history or your Google Sheet.</li>
        <li>Server logs are retained for a limited time for security and troubleshooting.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">Your choices and rights</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li><strong>Access/Deletion:</strong> You can delete chats in the app. To delete your account/profile, contact us.</li>
        <li><strong>GDPR/CCPA:</strong> Depending on your location, you may request access, correction, deletion, a copy of your data, or object to certain processing.</li>
        <li><strong>Do Not Sell:</strong> We do not sell your personal data.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">Security</h2>
      <p className="mb-6">
        We implement safeguards appropriate for the nature of the data. No method of transmission or storage is 100% secure;
        we work to protect your data but cannot guarantee absolute security.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">Children’s privacy</h2>
      <p className="mb-6">The Service is not intended for children under 13 (or 16 where applicable). We do not knowingly collect such data.</p>

      <h2 className="text-xl font-bold mt-8 mb-3">International transfers</h2>
      <p className="mb-6">
        Data may be processed in regions where we and our service providers operate (including the U.S.). We take steps to
        protect your data consistent with applicable laws.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">Changes</h2>
      <p className="mb-6">We may update this Policy from time to time. We will post the updated version with a new “Last updated” date.</p>

      <h2 className="text-xl font-bold mt-8 mb-3">Contact</h2>
      <p className="mb-6">
        Questions or requests? Contact us at <span className="font-semibold">[your contact email]</span> or use our feedback system within the app.
      </p>

      <div className="mt-10 text-xs text-white/50">
        Note: Replace placeholders like contact email with your actual details. This Policy reflects the app’s current behavior
        (Firebase Auth/Firestore, Google Sheets, Gemini/Genkit, transient uploads) as implemented in code.
      </div>
    </main>
  );
}



