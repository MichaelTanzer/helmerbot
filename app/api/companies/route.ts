export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { queryCompanies } from '@/lib/dataset';
import type { Power } from '@/lib/dataset';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const scope = (url.searchParams.get('scope') as 'all' | 'industry') || 'all';
  const industry = url.searchParams.get('industry') || undefined;

  const powersParam = (url.searchParams.get('powers') || '').split(',').filter(Boolean);
  const models = (url.searchParams.get('models') || '').split(',').filter(Boolean);

  const powers = powersParam as Power[];

  const page = Number(url.searchParams.get('page') || 1);
  const pageSize = Number(url.searchParams.get('pageSize') || 50);

  const data = await queryCompanies({
    scope,
    industry,
    powers,
    models,
    page,
    pageSize,
  });

  const companies = data.companies.map((c) => ({
    slug: c.slug,
    name: c.name,
    industry: c.industry,
    businessModels: c.businessModels,
    powers: c.powers,
    ticker: c.ticker,
  }));

  return NextResponse.json({ ...data, companies });
}
