"use client";
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MultiSelect } from '../components/MultiSelect';

export default function Page() {
  const router = useRouter();
  const [meta, setMeta] = React.useState<{ industries: string[]; businessModels: string[]; powers: string[] } | null>(null);

  const [scope, setScope] = React.useState<'all'|'industry'>('all');
  const [industry, setIndustry] = React.useState<string>('');
  const [selectedPowers, setSelectedPowers] = React.useState<string[]>([]);
  const [selectedModels, setSelectedModels] = React.useState<string[]>([]);

  React.useEffect(() => { fetch('/api/meta').then(r => r.json()).then(setMeta); }, []);

  const runScreen = () => {
    const params = new URLSearchParams();
    params.set('scope', scope);
    if (scope === 'industry' && industry) params.set('industry', industry);
    if (selectedPowers.length) params.set('powers', selectedPowers.join(','));
    if (selectedModels.length) params.set('models', selectedModels.join(','));
    router.push(`/results?${params.toString()}`);
  };

  if (!meta) return <main className="shell">Loading…</main>;

  return (
    <section className="stack">
      <div className="panel">
        <h1 className="h1">Company Screen</h1>
        <p className="subtle">Filter by scope, 7 Powers, and business models. Then run the screen.</p>
      </div>

      <fieldset className="fieldset panel">
        <legend className="legend">Scope</legend>
        <div className="controls-inline">
          {(['all','industry'] as const).map(s => (
            <label key={s} className="choice">
              <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} />
              <span>{s === 'all' ? 'Complete list' : 'Industry only'}</span>
            </label>
          ))}
          {scope === 'industry' && (
            <select className="select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Select an industry…</option>
              {meta.industries.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          )}
        </div>
      </fieldset>

      <div className="panel">
        <MultiSelect label="7 Powers" options={meta.powers} value={selectedPowers} onChange={setSelectedPowers} />
        <hr className="hr" />
        <MultiSelect label="Business Models" options={meta.businessModels} value={selectedModels} onChange={setSelectedModels} />
      </div>

      <div>
        <button onClick={runScreen} className="btn btn-primary">Run Screen</button>
      </div>
    </section>
  );
}
