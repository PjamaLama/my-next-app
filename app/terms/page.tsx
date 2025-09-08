import Link from "next/link";
import React from "react";

export default function TermsOfServicePage() {
  const lastUpdated = "2025-08-11";
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-white/90">
      <h1 className="text-3xl font-extrabold mb-2">Terms of Service</h1>
      <p className="text-sm text-white/60 mb-8">Last updated: {lastUpdated}</p>

      <p className="mb-6">
        These Terms govern your access to and use of <strong>Sheety AI</strong> (the "Service"). By using the Service,
        you agree to these Terms.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">1. Description of service</h2>
      <p className="mb-6">
        Sheety AI enables AI‑assisted analysis of images/PDFs and updates to Google Sheets you connect. You may chat with
        the assistant and choose to apply suggested updates to your spreadsheets.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">2. Accounts and eligibility</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>You must be able to form a binding contract and comply with these Terms.</li>
        <li>You must sign in with Google to use core features. You are responsible for maintaining your account security.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">3. Acceptable use</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>No unlawful, harmful, or infringing content or activities.</li>
        <li>No attempting to bypass security, rate limits, or abuse the Service or third‑party APIs.</li>
        <li>No uploading of prohibited content. Only images and PDFs are supported.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">4. Your data and permissions</h2>
      <p className="mb-6">
        You control the Google Sheets you connect and the content you upload or submit. You grant us the permissions needed
        to operate the Service (e.g., to read/write specific spreadsheet ranges you use, process uploads to extract text, and
        send prompts/context to AI models). We do not claim ownership of your underlying spreadsheet data.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">5. AI outputs and limitations</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>AI outputs may be inaccurate or incomplete. Review before applying updates to your Sheets.</li>
        <li>We use Google’s Gemini via Genkit; providers may change over time to improve reliability.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">6. Third‑party services</h2>
      <p className="mb-6">
        The Service integrates with Google Firebase (Auth/Firestore), Google Sheets API, and Gemini via Genkit. Your use of
        those services is also subject to their terms and privacy policies.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">7. Privacy</h2>
      <p className="mb-6">
        Our handling of personal information is described in our {" "}
        <Link className="text-yellow-300 underline" href="/privacy">Privacy Policy</Link>.
      </p>

      <h2 className="text-xl font-bold mt-8 mb-3">8. Beta disclaimers</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>The Service is in private beta and may change, break, or be discontinued.</li>
        <li>Features, performance, and availability are not guaranteed during beta.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">9. Warranties and liability</h2>
      <ul className="list-disc pl-6 space-y-3">
        <li>The Service is provided “as is” without warranties of any kind.</li>
        <li>To the maximum extent permitted by law, we are not liable for indirect or consequential damages, or any loss arising from reliance on AI outputs or integrations.</li>
      </ul>

      <h2 className="text-xl font-bold mt-8 mb-3">10. Termination</h2>
      <p className="mb-6">We may suspend or terminate access for violations of these Terms or risks to the Service; you may stop using the Service at any time.</p>

      <h2 className="text-xl font-bold mt-8 mb-3">11. Changes</h2>
      <p className="mb-6">We may update these Terms. We will post the updated version with a new “Last updated” date.</p>

      <h2 className="text-xl font-bold mt-8 mb-3">12. Contact</h2>
      <p className="mb-6">Questions? Contact us at <span className="font-semibold">admin@sheetyai.com</span>.</p>
    </main>
  );
}



