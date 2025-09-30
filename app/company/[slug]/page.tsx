"use client";
import * as React from 'react';
import { useParams } from 'next/navigation';

export default function CompanyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [text, setText] = React.useState<string>('Generating analysis… (This may take a hot minute)');

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companySlug: slug }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'LLM error');
        setText(data.output);
      } catch (e: any) {
        setText(`Error: ${e.message}`);
      }
    })();
  }, [slug]);

  return (
    <article className="panel prose">
      <h1 className="h1" style={{ marginBottom: 10 }}>{decodeURIComponent(String(slug))}</h1>
      <div className="subtle" style={{ marginBottom: 14 }}>7 Powers and Flywheel Analysis</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
    </article>
  );
}
