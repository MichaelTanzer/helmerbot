// app/results/page.tsx
import ResultsClient from './ResultsClient';

// Force dynamic (no prerender)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ResultsPage() {
  return <ResultsClient />;
}
