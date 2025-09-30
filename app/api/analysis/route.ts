export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDataset } from '@/lib/dataset';
import { makePrompt } from '@/lib/prompt';
import { getLLM } from '@/lib/llm';

const memory = new Map<string, string>();

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    let { companySlug } = body;
    if (!companySlug) {
      return NextResponse.json({ error: 'companySlug required' }, { status: 400 });
    }
    if (Array.isArray(companySlug)) companySlug = companySlug[0];

    const { companies } = await getDataset();
    const company = companies.find(c => c.slug === companySlug);
    if (!company) {
      return NextResponse.json({ error: `Company not found: ${companySlug}` }, { status: 404 });
    }

const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
if (!hasOpenRouter) {
  return NextResponse.json(
    { error: 'LLM not configured. Set OPENROUTER_API_KEY (and OPENROUTER_MODEL) in .env' },
    { status: 500 }
  );
}

    const prompt = makePrompt(company);
    const key = company.slug + '|' + (prompt.length % 1e9);

    if (memory.has(key)) {
      return NextResponse.json({ cached: true, output: memory.get(key) });
    }

    const llm = getLLM();
    const output = await llm.generate(prompt);
    memory.set(key, output);

    return NextResponse.json({ cached: false, output });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown server error' }, { status: 500 });
  }
}
