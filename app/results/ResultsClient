"use client";
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { CompanyCard } from '../../components/CompanyCard';

type CompanyListItem = {
  slug: string;
  name: string;
  industry: string;
  businessModels: string[];
  powers: string[];
  ticker: string | null;
};

type ResultsResponse = {
  companies: CompanyListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export default function ResultsClient() {
  const sp = useSearchParams();
  const [data, setData] = React.useState<ResultsResponse | null>(null);

  const page = Number(sp.get('page') || 1);
  const pageSize = Number(sp.get('pageSize') || 50);

  const query = React.useMemo(() => {
    const params = new URLSearchParams(sp.toString());
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return params.toString();
  }, [sp, page, pageSize]);

  React.useEffect(() => {
    (async () => {
      const r = await fetch(`/api/companies?${query}`);
      const json = (await r.json()) as ResultsResponse;
      setData(json);
    })();
  }, [query]);

  if (!data) return <main className="shell">Loading…</main>;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <section className="stack">
      <div className="toolbar panel">
        <div>
          <h1 className="h1" style={{ marginBottom: 4 }}>Results</h1>
          <div className="subtle">Page {data.page} of {totalPages} — {data.total} companies</div>
        </div>
        <a className="btn btn-ghost" href={`/api/companies/export?${sp.toString()}`}>Export CSV</a>
      </div>

      <div className="stack">
        {data.companies.map((c) => <CompanyCard key={c.slug} c={c} />)}
      </div>

      <div className="pager">
        <button
          disabled={page <= 1}
          className="btn btn-ghost"
          onClick={() => {
            const p = new URLSearchParams(sp.toString());
            p.set('page', String(page - 1));
            window.location.search = p.toString();
          }}
        >
          ← Prev
        </button>
        <button
          disabled={page >= totalPages}
          className="btn btn-ghost"
          onClick={() => {
            const p = new URLSearchParams(sp.toString());
            p.set('page', String(page + 1));
            window.location.search = p.toString();
          }}
        >
          Next →
        </button>
      </div>
    </section>
  );
}
