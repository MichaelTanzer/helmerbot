"use client";
import * as React from 'react';
import { useParams } from 'next/navigation';

export default function CompanyPage() {
  const { slug } = useParams<{ slug: string }>();
  return <AnalysisRequest key={slug} slug={slug} />;
}

function AnalysisRequest({ slug }: { slug: string }) {
  const [status, setStatus] = React.useState<'idle' | 'pending' | 'accepted'>('idle');
  const [error, setError] = React.useState('');
  const requestId = React.useRef<string | null>(null);
  // A ref blocks a second click before React has rendered the disabled button.
  const locked = React.useRef(false);

  async function runAnalysis() {
    if (locked.current) return;
    locked.current = true;
    setStatus('pending');
    setError('');
    try {
      // Keep the same ID after an ambiguous network failure so retries dedupe.
      requestId.current ??= crypto.randomUUID();
      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companySlug: slug, requestId: requestId.current }),
      });
      const data = await response.json();
      if (response.status !== 202 || data?.accepted !== true) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to accept analysis. Please try again later.');
      }
      setStatus('accepted');
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Unable to accept analysis. Please try again later.');
      setStatus('idle');
      locked.current = false;
    }
  }

  return (
    <article className="panel prose">
      <h1 className="h1" style={{ marginBottom: 10 }}>{slug}</h1>
      <div className="subtle" style={{ marginBottom: 14 }}>7 Powers and Flywheel Analysis</div>
      <p>Run Analysis requests the full analysis by email to your existing sign-in email. The report is not shown on this page.</p>
      <p>Wait for request acceptance before closing this tab.</p>
      <p className="subtle">Background execution is limited; completion and email delivery are not guaranteed. If you receive no email, retry later.</p>
      <button type="button" className="btn" onClick={runAnalysis} disabled={status !== 'idle'}>
        {status === 'pending' ? 'Requesting…' : status === 'accepted' ? 'Request accepted' : 'Run Analysis'}
      </button>
      <div role="status" aria-live="polite">
        {status === 'pending' && <p>Waiting for request acceptance. Keep this tab open.</p>}
        {status === 'accepted' && <p>Request accepted. You may close this tab. This confirms acceptance, not completion or email delivery. To retry later if no email arrives, return to this page.</p>}
      </div>
      {error && <p role="alert">Error: {error}</p>}
    </article>
  );
}
