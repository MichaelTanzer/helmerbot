import { Suspense } from 'react';
import SignInClient from './SignInClient';

// Disable prerendering and ISR; render at request-time.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Sign in — HelmerBot',
  description: 'Please sign in to continue',
};

export default function SignInPage() {
  return (
    <Suspense fallback={<section className="stack"><div className="panel">Loading…</div></section>}>
      <SignInClient />
    </Suspense>
  );
}
