export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getDataset, SEVEN_POWERS } from '@/lib/dataset';

export async function GET() {
  const { industries, models } = await getDataset();
  return NextResponse.json({
    industries,
    businessModels: models,
    powers: Array.from(SEVEN_POWERS),
  });
}
