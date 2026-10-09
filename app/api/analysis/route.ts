export const runtime = 'nodejs';
export const maxDuration = 300;

import { after, NextRequest, NextResponse } from 'next/server';
import { getDataset } from '@/lib/dataset';
import { makePrompt } from '@/lib/prompt';
import { getLLM } from '@/lib/llm';
import { AnalysisError, analysisBody, analysisConfig, analysisRecipient, emailAnalysis, reserveAnalysis } from '@/lib/analysis-email';

function isSameOrigin(req: NextRequest): boolean {
  // NextURL rewrites loopback hosts to localhost and may use the bind hostname.
  // Host is the browser's target authority, not the framework's internal URL.
  // Proxies must preserve Host and sanitize protocol forwarding before Next;
  // never substitute an arbitrary X-Forwarded-Host or infer protocol from Origin.
  const host = req.headers.get('host');
  const authority = host?.match(/^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(0|[1-9]\d{0,4}))?$/i);
  if (!host || !authority) return false;
  try {
    const protocol = new URL(req.url).protocol;
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    const target = new URL(`${protocol}//${host}`);
    // Reject URL-parser repairs (encoded hosts, shortened IPs, noncanonical ports).
    if (target.hostname !== authority[1].toLowerCase()) return false;
    return req.headers.get('origin') === target.origin;
  } catch { return false; }
}

async function readBody(req: NextRequest, signal: AbortSignal): Promise<unknown> {
  const limit = 16384;
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new AnalysisError(413, 'Request body is too large.');
  if (!req.body) throw new AnalysisError(400, 'JSON body required.');
  const reader = req.body.getReader();
  // Close pending reads without awaiting a hostile source's cancel promise.
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { cancel(); throw new AnalysisError(413, 'Request body is too large.'); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new AnalysisError(400, 'Invalid JSON body.'); }
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const deadline = started + maxDuration * 1000;
  const preparationDeadline = started + 10000;
  try {
    if (!isSameOrigin(req)) throw new AnalysisError(403, 'Same-origin request required.');
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) throw new AnalysisError(415, 'Content-Type must be application/json.');
    const recipient = analysisRecipient(req.cookies.get('hb_user')?.value);
    const config = analysisConfig();
    const controller = new AbortController();
    const timeoutError = new AnalysisError(503, 'Analysis preparation timed out. Please try again.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const prepare = async () => {
      const body = analysisBody(await readBody(req, controller.signal));
      controller.signal.throwIfAborted();
      const dataset = await getDataset();
      return { ...body, ...dataset };
    };
    const { companySlug, requestId, options, companies } = await (async () => {
      try {
        if (Date.now() >= preparationDeadline) throw timeoutError;
        return await Promise.race([prepare(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(timeoutError); reject(timeoutError); }, Math.max(0, preparationDeadline - Date.now()));
        })]);
      } finally { clearTimeout(timer); }
    })();
    if (Date.now() >= preparationDeadline) throw timeoutError;
    const company = companies.find(c => c.slug === companySlug);
    if (!company) throw new AnalysisError(404, 'Company not found.');
    const reservation = reserveAnalysis(requestId, company.slug, recipient, options);
    if (!reservation.duplicate) {
      try {
        if (deadline - Date.now() < 265000) throw new AnalysisError(503, 'Insufficient background execution time.');
        // Next owns this awaited callback after the response, independent of the tab.
        // This is bounded execution, not a durable queue or guaranteed delivery.
        after(async () => {
          await emailAnalysis(config, recipient, company.name, reservation.key, async () => {
            // Reserve two delivery attempts plus a five-second runtime margin.
            const remaining = Math.min(240000, deadline - Date.now() - 25000);
            if (remaining <= 0) throw new Error('Generation deadline elapsed');
            return getLLM().generate(makePrompt(company), { ...options, signal: AbortSignal.timeout(remaining) });
          }, deadline);
        });
      } catch {
        reservation.release();
        throw new AnalysisError(503, 'Background scheduling is unavailable.');
      }
    }
    return NextResponse.json({ accepted: true, requestId, duplicate: reservation.duplicate }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AnalysisError ? error.message : 'Unable to accept analysis. Please try again later.' }, { status: error instanceof AnalysisError ? error.status : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
