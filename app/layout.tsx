import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import ClientRoot from './ClientRoot';
import { ErrorBoundary } from './components/ErrorBoundary';
import ClarityInitializer from './components/ClarityInitializer';

// Genkit telemetry is initialized client-side inside ClientRoot

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#18181b',
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: "Sheety AI - Your Automated Report Assistant",
    template: "%s | Sheety AI"
  },
  description: "AI-powered voice-to-spreadsheet reporting tool. Convert speech to structured data in Google Sheets effortlessly. Save hours on data entry with natural language processing.",
  keywords: [
    "AI", "voice", "reporting", "spreadsheets", "automation", "speech recognition",
    "Google Sheets", "data entry", "voice commands", "AI assistant", "productivity",
    "business intelligence", "data automation", "voice to text", "spreadsheet automation"
  ],
  authors: [{ name: "Sheety AI Team" }],
  creator: "Sheety AI",
  publisher: "Sheety AI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sheety AI",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" }
    ],
    shortcut: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Sheety AI",
    title: "Sheety AI - Your Automated Report Assistant",
    description: "AI-powered voice-to-spreadsheet reporting tool. Convert speech to structured data in Google Sheets effortlessly. Save hours on data entry with natural language processing.",
    images: [
      {
        url: "/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "Sheety AI Logo - AI-Powered Voice to Spreadsheet Automation",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@sheetyai", // You can update this when you have a Twitter handle
    creator: "@sheetyai",
    title: "Sheety AI - Your Automated Report Assistant",
    description: "AI-powered voice-to-spreadsheet reporting tool. Convert speech to structured data in Google Sheets effortlessly.",
    images: ["/icon-512x512.png"],
  },
  verification: {
    // Add Google Search Console verification when available
    // google: 'your-google-site-verification-code',
  },
  category: "productivity",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Sheety AI",
    "description": "AI-powered voice-to-spreadsheet reporting tool that converts speech to structured data in Google Sheets effortlessly",
    "url": process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "Voice-to-spreadsheet automation",
      "Natural language processing",
      "Google Sheets integration",
      "AI-powered data entry",
      "Real-time updates"
    ],
    "screenshot": `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/icon-512x512.png`,
    "author": {
      "@type": "Organization",
      "name": "Sheety AI Team"
    }
  };

  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ minHeight: '100vh', background: 'var(--background)' }}
      >
        <ClarityInitializer />
        <ErrorBoundary>
          <ClientRoot>{children}</ClientRoot>
        </ErrorBoundary>
      </body>
    </html>
  );
}

// ClientGatedLayout is a client component that conditionally renders NavBar and sidebar margin
