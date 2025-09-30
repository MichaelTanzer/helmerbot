// app/results/page.tsx  (Server Component)
import ResultsClient from './ResultsClient';

// Force this route to be rendered dynamically at request time (no prerender/SSG)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ResultsPage() {
  return <ResultsClient />;
}
