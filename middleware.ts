import { NextRequest, NextResponse } from 'next/server';

function getAllowedOrigins(): string[] {
  const envOrigins = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.SITE_URL,
    process.env.APP_URL,
  ].filter((v): v is string => !!v);
  // Add Vercel preview URL if present
  if (process.env.VERCEL_URL) {
    envOrigins.push(`https://${process.env.VERCEL_URL}`);
  }
  return Array.from(new Set(envOrigins));
}

function resolveCorsOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) {
    // If not explicitly configured, default to reflecting the request origin
    return requestOrigin;
  }
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

export function middleware(req: NextRequest) {
  // Only apply CORS to API routes
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const origin = req.headers.get('origin');
  const allowOrigin = resolveCorsOrigin(origin);

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,PATCH,DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  };
  if (allowOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = allowOrigin;
    corsHeaders['Vary'] = 'Origin';
  }

  // Preflight request
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const res = NextResponse.next();
  Object.entries(corsHeaders).forEach(([k, v]) => {
    res.headers.set(k, v);
  });
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};


