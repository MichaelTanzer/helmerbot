import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

export type Company = {
  name: string;
  slug: string;
  ticker: string | null;
  industry: string;
  businessModels: string[];
  powers: string[];
  mechanisms: string[];
};

const DATA_CSV_PATH = process.env.DATA_CSV_PATH || path.join(process.cwd(), 'data', 'companies.csv');
const DATA_CSV_ENCODING = (process.env.DATA_CSV_ENCODING as BufferEncoding) || 'utf8';

const SEVEN_POWERS = [
  'Scale Economies',
  'Network Effects',
  'Counter-Positioning',
  'Switching Costs',
  'Branding',
  'Cornered Resource',
  'Process Power',
] as const;
export type Power = typeof SEVEN_POWERS[number];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function canonPower(raw: string | null | undefined): Power | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'scale' || s === 'scale economies') return 'Scale Economies';
  if (s === 'network effects' || s === 'network economies') return 'Network Effects';
  if (s === 'counter-positioning' || s === 'counter positioning') return 'Counter-Positioning';
  if (s === 'switching costs') return 'Switching Costs';
  if (s === 'brand' || s === 'branding') return 'Branding';
  if (s === 'cornered resource') return 'Cornered Resource';
  if (s === 'process power') return 'Process Power';
  return null;
}

type RawRow = Record<string, string | null | undefined>;

let _cache: { loadedAt: number; companies: Company[]; industries: string[]; models: string[] } | null = null;

async function loadCSV(): Promise<Company[]> {
  const buf = await fs.readFile(DATA_CSV_PATH, { encoding: DATA_CSV_ENCODING });
  const rows = parse(buf, { columns: true, skip_empty_lines: true }) as RawRow[];

  const companies: Company[] = rows.map((r) => {
    const name = String(r['Company Name'] ?? '').trim();
    const ticker = (r['Ticker'] ?? '').toString().trim() || null;
    const industry = String(r['Industry'] ?? '').trim();

    const bm = [
      r['Business Model 1'], r['Business Model 2'], r['Business Model 3'],
    ].map(v => (v ?? '').toString().trim()).filter(Boolean);

    const powers = [
      canonPower(r['Company Power #1']),
      canonPower(r['Company Power #2']),
      canonPower(r['Company Power #3']),
    ].filter(Boolean) as Power[];

    const mechanisms = [
      r['Mechanism #1'], r['Mechanism #2'], r['Mechanism #3'],
    ].map(v => (v ?? '').toString().trim()).filter(Boolean);

    return {
      name,
      slug: slugify(name),
      ticker,
      industry,
      businessModels: Array.from(new Set(bm)),
      powers: Array.from(new Set(powers)),
      mechanisms,
    };
  });

  const seen = new Set<string>();
  const unique = companies.filter(c => (seen.has(c.slug) ? false : (seen.add(c.slug), true)));

  return unique;
}

export async function getDataset() {
  if (_cache) return _cache;
  const companies = await loadCSV();
  const industries = Array.from(new Set(companies.map(c => c.industry))).sort((a, b) => a.localeCompare(b));
  const models = Array.from(new Set(companies.flatMap(c => c.businessModels))).sort((a, b) => a.localeCompare(b));
  _cache = { loadedAt: Date.now(), companies, industries, models };
  return _cache;
}

export type FilterInput = {
  scope?: 'all' | 'industry';
  industry?: string;
  powers?: Power[];
  models?: string[];
  page?: number;
  pageSize?: number;
};

export async function queryCompanies(f: FilterInput) {
  const { companies } = await getDataset();
  const scope = f.scope || 'all';
  const page = Math.max(1, f.page || 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize || 50));

  let list = companies;

  if (scope === 'industry' && f.industry) {
    list = list.filter(c => c.industry === f.industry);
  }
  if (f.powers && f.powers.length) {
    const hasAnyPower = new Set(f.powers);
    list = list.filter(c => c.powers.some(p => hasAnyPower.has(p as Power)));
  }
  if (f.models && f.models.length) {
    const hasAnyModel = new Set(f.models);
    list = list.filter(c => c.businessModels.some(m => hasAnyModel.has(m)));
  }

  const total = list.length;
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  return { total, page, pageSize, companies: pageItems };
}

export async function exportCSV(f: FilterInput) {
  const { total, companies } = await queryCompanies({ ...f, page: 1, pageSize: 100_000 });
  const header = ['name', 'slug', 'industry', 'business_models', 'powers', 'ticker'];
  const lines = [header.join(',')];

  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;

  for (const c of companies) {
    const line = [
      c.name,
      c.slug,
      c.industry,
      c.businessModels.join('; '),
      c.powers.join('; '),
      c.ticker ?? '',
    ].map(v => esc(String(v)));
    lines.push(line.join(','));
  }
  return { filename: `companies_export_${total}.csv`, csv: lines.join('\n') };
}

export { SEVEN_POWERS };
