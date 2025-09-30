import Link from 'next/link';

export function CompanyCard({ c }: { c: {
  slug: string; name: string; industry: string;
  businessModels: string[]; powers: string[]; ticker: string | null;
} }) {
  return (
    <div className="card">
      <div className="toolbar">
        <h3 className="h2" style={{ margin: 0 }}>{c.name}</h3>
        <Link className="btn btn-link" href={`/company/${c.slug}`}>View analysis →</Link>
      </div>
      <div className="subtle" style={{ marginTop: 6 }}>
        <div><strong>Industry:</strong> {c.industry}</div>
        <div><strong>Models:</strong> {c.businessModels.join(', ') || '—'}</div>
        <div><strong>7 Powers:</strong> {c.powers.join(', ') || '—'}</div>
        {c.ticker ? <div><strong>Ticker:</strong> {c.ticker}</div> : null}
      </div>
    </div>
  );
}