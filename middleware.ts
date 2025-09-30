import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

// Apply to every route except a few static/assets
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals and public static files
  if (pathname.startsWith('/_next') || PUBLIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  // Allow the sign-in and the signup API itself
  if (pathname === '/sign-in' || pathname.startsWith('/api/signup')) {
    return NextResponse.next();
  }

  // Everything else requires the cookie
  const session = req.cookies.get('hb_user');
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// This matcher runs middleware for all routes except the listed ones.
// Public files are also excluded by the early return above.
export const config = {
  matcher: ['/((?!favicon.ico|robots.txt|sitemap.xml).*)'],
};
