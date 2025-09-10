import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ClientRoot from './ClientRoot';
import { ErrorBoundary } from './components/ErrorBoundary';
import TrackingStatusPanel from './components/TrackingStatusPanel';

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
      { url: "/favicon.ico", sizes: "any" },
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
  // Structured data for SEO - Generate once to ensure consistency
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Sheety AI",
    "description": "AI-powered voice-to-spreadsheet reporting tool that converts speech to structured data in Google Sheets effortlessly",
    "url": siteUrl,
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
    "screenshot": `${siteUrl}/icon-512x512.png`,
    "author": {
      "@type": "Organization",
      "name": "Sheety AI Team"
    }
  };

  return (
    <html lang="en" className="dark">
      <head>
        <meta name="facebook-domain-verification" content="ej7xnzg04hdwpuagfpyu10c32wmlgj" />
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />

        {/* Meta Pixel Code - Essential for Facebook/Instagram/WhatsApp Ads */}
        <Script
          id="facebook-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
              n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '1447640459621523');
              fbq('track', 'PageView');
            `,
          }}
        />

        {/* Google Ads tracking */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-17507562116"
          strategy="afterInteractive"
        />
        <Script
          id="google-ads"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'AW-17507562116');
              } catch(e) {
                console.warn('Google Ads tracking failed to load:', e);
              }
            `,
          }}
        />

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-4PSKB5BJY1"
          strategy="afterInteractive"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'G-4PSKB5BJY1');
              } catch(e) {
                console.warn('Google Analytics failed to load:', e);
              }
            `,
          }}
        />

        {/* Microsoft Clarity */}
        <Script
          id="microsoft-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window, document, "clarity", "script", "t6kpt5r8l4");
              } catch(e) {
                console.warn('Microsoft Clarity failed to load:', e);
              }
            `,
          }}
        />

        {/* TikTok Pixel */}
        <Script
          src="https://analytics.tiktok.com/i18n/pixel/sdk.js?sdkid=D2VDTKRC77U649U8UH9G"
          strategy="afterInteractive"
        />
        <Script
          id="tiktok-pixel-init"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof ttq !== 'undefined' && !window.tiktokPixelLoaded) {
                ttq.load('D2VDTKRC77U649U8UH9G');
                ttq.page();
                window.tiktokPixelLoaded = true;
                console.log('TikTok pixel initialized successfully');
              } else if (window.tiktokPixelLoaded) {
                console.log('TikTok pixel already initialized, skipping duplicate initialization');
              } else {
                console.warn('TikTok pixel SDK not loaded yet');
              }
            `,
          }}
        />

        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://analytics.tiktok.com/i18n/pixel/pxl/?tid=D2VDTKRC77U649U8UH9G&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ minHeight: '100vh', background: 'var(--background)' }}
      >
        <ErrorBoundary>
          <ClientRoot>{children}</ClientRoot>
        </ErrorBoundary>
        {process.env.NODE_ENV === 'development' && <TrackingStatusPanel />}
      </body>
    </html>
  );
}

// ClientGatedLayout is a client component that conditionally renders NavBar and sidebar margin
