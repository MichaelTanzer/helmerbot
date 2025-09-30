export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

type SignupBody = { name: string; email: string };

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function POST(req: NextRequest) {
  try {
    const { name, email } = (await req.json()) as Partial<SignupBody>;

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY || !process.env.SIGNUP_TO_EMAIL) {
      return NextResponse.json(
        { error: 'Email service not configured (set RESEND_API_KEY and SIGNUP_TO_EMAIL)' },
        { status: 500 }
      );
    }

    // Send email via Resend — no extra npm needed
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SIGNUP_FROM_EMAIL || 'HelmerBot <onboarding@resend.dev>',
        to: process.env.SIGNUP_TO_EMAIL,
        subject: 'New HelmerBot sign-in',
        text: [
          `Name: ${name.trim()}`,
          `Email: ${email.trim()}`,
          `At: ${new Date().toISOString()}`,
        ].join('\n'),
      }),
    });

    if (!sendRes.ok) {
      let detail = `HTTP ${sendRes.status}`;
      try {
        const e = await sendRes.json();
        detail += ` ${e?.error?.message ?? ''}`;
      } catch {}
      return NextResponse.json(
        { error: `Unable to send email (${detail})` },
        { status: 502 }
      );
    }

    // Set a simple session cookie (contains name|email)
    const res = NextResponse.json({ ok: true });
    res.cookies.set('hb_user', encodeURIComponent(`${name.trim()}|${email.trim()}`), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
