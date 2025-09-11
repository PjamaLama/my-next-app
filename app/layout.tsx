import type { Metadata, Viewport } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ClientRoot from './ClientRoot';
import { ErrorBoundary } from './components/ErrorBoundary';

// Genkit telemetry is initialized client-side inside ClientRoot

// Static structured data for SEO - defined at module level for better performance
const getStructuredData = (siteUrl: string) => ({
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
});

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
  maximumScale: 5,
  userScalable: true,
  themeColor: '#18181b',
  viewportFit: 'cover',
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
  // Static structured data for SEO - defined once at module level for better performance
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  return (
    <html lang="en" className="dark">
      <head>
        <meta name="facebook-domain-verification" content="ej7xnzg04hdwpuagfpyu10c32wmlgj" />

        {/* Preload only favicon as it's used immediately in browser tab */}
        <link rel="preload" href="/favicon.ico" as="image" type="image/x-icon" />

        {/* Preload fonts for better performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getStructuredData(siteUrl)),
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

        {/* Google Tag Manager - Handles Google Ads and Google Analytics */}
        <Script id="gtm-script" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID || 'GTM-XXXXXXX'}');`}
        </Script>

        {/* Microsoft Clarity - Defer loading for better performance */}
        <Script
          id="microsoft-clarity"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window, document, "clarity", "script", "${process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 't6kpt5r8l4'}");
              } catch(e) {
                console.warn('Microsoft Clarity failed to load:', e);
              }
            `,
          }}
        />

        {/* Google Tag Manager noscript fallback */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID || 'GTM-XXXXXXX'}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          ></iframe>
        </noscript>

        {/* TikTok Pixel - Now managed through Google Tag Manager to prevent duplicate loading */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ minHeight: '100vh', background: 'var(--background)' }}
      >
        <ErrorBoundary>
          <ClientRoot>{children}</ClientRoot>
        </ErrorBoundary>
      </body>
    </html>
  );
}

// ClientGatedLayout is a client component that conditionally renders NavBar and sidebar margin
