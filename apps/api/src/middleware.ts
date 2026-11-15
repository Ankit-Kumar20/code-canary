import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

// Credentialed CORS for the web app, which calls this API (including /api/auth) cross-origin.
export function middleware(request: NextRequest) {
  const headers = corsHeaders();

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
