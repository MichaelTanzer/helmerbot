export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL('/sign-in', req.url);
  const res = NextResponse.redirect(url);
  res.cookies.set('hb_user', '', { path: '/', maxAge: 0 });
  return res;
}
