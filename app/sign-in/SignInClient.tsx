"use client";
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SignInClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/';

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = name.trim().length >= 2 && validEmail && !pending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const r = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data: { ok?: boolean; error?: string } = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'Sign-in failed');

      // Always go to landing page after success
      router.replace('/');

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setPending(false);
    }
  }

  return (
    <section className="stack" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="panel">
        <h1 className="h1" style={{ marginBottom: 8 }}>Welcome</h1>
        <p className="subtle">Please enter your name and email to continue.</p>
      </div>

      <form onSubmit={onSubmit} className="panel stack">
        <div className="fieldset">
          <label className="legend">Name</label>
          <input
            className="input"
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </div>

        <div className="fieldset">
          <label className="legend">Email</label>
          <input
            className="input"
            type="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {!validEmail && email.length > 0 ? (
            <div className="subtle">Please enter a valid email.</div>
          ) : null}
        </div>

        {error ? (
          <div className="card" style={{ borderColor: 'rgba(255,77,109,.45)' }}>
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {pending ? 'Submitting…' : 'Enter'}
        </button>
      </form>
    </section>
  );
}
