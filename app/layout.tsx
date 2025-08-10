import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FirebaseProvider } from "./providers/FirebaseProvider";
import { SheetProvider } from "./providers/SheetProvider";
import { ServiceAccountProvider } from "./providers/ServiceAccountProvider";
import { SettingsProvider } from "./providers/SettingsProvider"; // Import the new SettingsProvider
import { FirestoreSyncProvider } from "./providers/FirestoreSyncProvider";
import { ChatProvider } from "./providers/ChatProvider";
import { enableFirebaseTelemetry } from '@genkit-ai/firebase';
import SidePanel from './components/SidePanel';
import NavBar from './NavBar';
import { DialogProvider } from './providers/DialogProvider';
import FeedbackButton from './components/FeedbackButton';
import FeedbackNudge from './components/FeedbackNudge';
import { ClientGatedLayout } from './providers/ClientGatedLayout';

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
  themeColor: '#18181b',
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: "Sheety AI - Your Automated Report Assistant",
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
    title: "Sheety AI - Your Automated Report Assistant",
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
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ minHeight: '100vh', background: 'var(--background)' }}
      >
        <FirebaseProvider>
          <SheetProvider>
            <ServiceAccountProvider>
              <SettingsProvider>
                <FirestoreSyncProvider>
                  <ChatProvider>
                    <DialogProvider>
                      {/* Sidebar + NavBar are hidden on landing (no user) to avoid empty space */}
                      <SidePanel />
                      <div className="transition-all min-h-screen flex flex-col">
                        {/* Only render NavBar and sidebar margin when a user is present */}
                        <ClientGatedLayout>
                          {children}
                        </ClientGatedLayout>
                        <FeedbackNudge />
                        <FeedbackButton />
                      </div>
                      {/* Mobile open button removed; use navbar hamburger */}
                    </DialogProvider>
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

// ClientGatedLayout is a client component that conditionally renders NavBar and sidebar margin
