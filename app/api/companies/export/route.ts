export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { exportCSV } from '@/lib/dataset';
import type { Power } from '@/lib/dataset';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const scope = (url.searchParams.get('scope') as 'all' | 'industry') || 'all';
  const industry = url.searchParams.get('industry') || undefined;

  const powersParam = (url.searchParams.get('powers') || '').split(',').filter(Boolean);
  const models = (url.searchParams.get('models') || '').split(',').filter(Boolean);

  const powers = powersParam as Power[];

  const { filename, csv } = await exportCSV({ scope, industry, powers, models });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

