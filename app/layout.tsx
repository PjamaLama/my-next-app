import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FirebaseProvider } from "./providers/FirebaseProvider";
import { SheetProvider } from "./providers/SheetProvider";
import { ServiceAccountProvider } from "./providers/ServiceAccountProvider";
import { SettingsProvider } from "./providers/SettingsProvider"; // Import the new SettingsProvider
import { FirestoreSyncProvider } from "./providers/FirestoreSyncProvider";
import { ChatProvider } from "./providers/ChatProvider";
import NavBar from "./NavBar";
import { enableFirebaseTelemetry } from '@genkit-ai/firebase';

// Enable Firebase telemetry for Genkit monitoring
enableFirebaseTelemetry();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#18181b' }
  ],
}

export const metadata: Metadata = {
  title: "Sheety AI - Your AI for Google Sheets",
  description: "AI-powered voice-to-spreadsheet reporting tool. Convert speech to structured data in Google Sheets effortlessly.",
  keywords: ["AI", "voice", "reporting", "spreadsheets", "automation", "speech recognition"],
  authors: [{ name: "Sheety AI Team" }],
  creator: "Sheety AI",
  publisher: "Sheety AI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sheety AI",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192x192.png",
    shortcut: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  openGraph: {
    type: "website",
    siteName: "Sheety AI",
    title: "Sheety AI - Your AI for Google Sheets",
    description: "AI-powered voice-to-spreadsheet reporting tool",
    images: [
      {
        url: "/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "Sheety AI Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Sheety AI",
    description: "AI-powered voice-to-spreadsheet reporting tool",
    images: ["/icon-512x512.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ minHeight: '100vh', background: 'var(--background)' }}
      >
        <FirebaseProvider>
          <SheetProvider>
            <ServiceAccountProvider>
              <SettingsProvider> {/* Wrap with SettingsProvider */}
                <FirestoreSyncProvider>
                  <ChatProvider>
                    <NavBar />
                    {children}
                  </ChatProvider>
                </FirestoreSyncProvider>
              </SettingsProvider>
            </ServiceAccountProvider>
          </SheetProvider>
        </FirebaseProvider>
      </body>
    </html>
  );
}
