export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDataset } from '@/lib/dataset';
import { makePrompt } from '@/lib/prompt';
import { getLLM } from '@/lib/llm';

type AnalysisOptions = {
  model?: string;
  maxOutputTokens?: number;
  maxTokens?: number; // accepted alias; normalized below
  temperature?: number;
  topP?: number;
  stop?: string[];
};

type AnalysisRequestBody = {
  companySlug: string | string[];
  options?: AnalysisOptions;
};

// simple in-memory cache
const memory = new Map<string, string>();

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AnalysisRequestBody>;

    let companySlug = body.companySlug;
    if (!companySlug) {
      return NextResponse.json({ error: 'companySlug required' }, { status: 400 });
    }
    if (Array.isArray(companySlug)) companySlug = companySlug[0];

    const { companies } = await getDataset();
    const company = companies.find((c) => c.slug === companySlug);
    if (!company) {
      return NextResponse.json({ error: `Company not found: ${companySlug}` }, { status: 404 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'LLM not configured. Set OPENROUTER_API_KEY (and OPENROUTER_MODEL) in .env' },
        { status: 500 }
      );
    }

    const prompt = makePrompt(company);

    const optKey = body.options
      ? JSON.stringify({
          m: body.options.model ?? null,
          mt: body.options.maxOutputTokens ?? body.options.maxTokens ?? null,
          t: body.options.temperature ?? null,
          p: body.options.topP ?? null,
          s: Array.isArray(body.options.stop) ? body.options.stop.join('|') : null,
        })
      : '';

    const cacheKey = `${company.slug}|${prompt.length % 1e9}|${optKey}`;
    if (memory.has(cacheKey)) {
      return NextResponse.json({ cached: true, output: memory.get(cacheKey) });
    }

    const llm = getLLM();
    const output = await llm.generate(prompt, {
      model: body.options?.model,
      maxOutputTokens: body.options?.maxOutputTokens ?? body.options?.maxTokens,
      temperature:
        typeof body.options?.temperature === 'number' ? body.options.temperature : undefined,
      topP: typeof body.options?.topP === 'number' ? body.options.topP : undefined,
      stop: Array.isArray(body.options?.stop) ? body.options.stop : undefined,
    });

    memory.set(cacheKey, output);
    return NextResponse.json({ cached: false, output });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
