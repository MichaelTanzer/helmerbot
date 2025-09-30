// lib/llm.ts — OpenRouter (Responses API Alpha) single-export client

export interface LLMOptions {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
}

export interface LLMClient {
  generate(prompt: string, options?: LLMOptions): Promise<string>;
}

function numEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function arrEnv(name: string): string[] | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

class OpenRouterLLM implements LLMClient {
  private apiKey: string;
  private base: string;
  private defaultModel: string;
  private defaults: {
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    stop?: string[];
  };
  private referer?: string;
  private title?: string;

  constructor() {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }
    this.apiKey = process.env.OPENROUTER_API_KEY!;
    this.base = (process.env.OPENROUTER_BASE || 'https://openrouter.ai/api/alpha').replace(/\/$/, '');
    this.defaultModel = process.env.OPENROUTER_MODEL || 'openai/gpt-5';
    this.defaults = {
      maxOutputTokens: numEnv('OPENROUTER_MAX_OUTPUT_TOKENS', 8000),
      temperature: numEnv('OPENROUTER_TEMPERATURE', 0.5),
      topP: numEnv('OPENROUTER_TOP_P', 1),
      stop: arrEnv('OPENROUTER_STOP'),
    };
    this.referer = process.env.OPENROUTER_SITE_URL;
    this.title = process.env.OPENROUTER_APP_TITLE;
  }

  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const max_output_tokens = options?.maxOutputTokens ?? this.defaults.maxOutputTokens;
    const temperature = options?.temperature ?? this.defaults.temperature;
    const top_p = options?.topP ?? this.defaults.topP;
    const stop = options?.stop ?? this.defaults.stop;

    const url = `${this.base}/responses`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.referer) headers['HTTP-Referer'] = this.referer;
    if (this.title) headers['X-Title'] = this.title;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[OpenRouterLLM] POST', url, { model, max_output_tokens, temperature, top_p, stop });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens,
        temperature,
        top_p,
        ...(stop ? { stop } : {}),
      }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const e = await res.json();
        detail += ` ${e?.error?.message ?? ''}`;
      } catch {}
      throw new Error(`OpenRouter error: ${detail}`);
    }

    const data = await res.json();

    // Responses API Alpha: data.output[].content[].type === 'output_text'
    const out: string[] = [];
    const output = Array.isArray(data.output) ? data.output : [];
    for (const item of output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        if (part?.type === 'output_text' && typeof part?.text === 'string') {
          out.push(part.text);
        }
      }
    }
    return out.join('').trim();
  }
}

// Single, final export — no duplicates.
export function getLLM(): LLMClient {
  // Only OpenRouter is supported in this build.
  return new OpenRouterLLM();
}
