import { createHash } from 'node:crypto';
import type { LLMOptions } from '@/lib/llm';

export class AnalysisError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new AnalysisError(status, message); };
const controls = /[\x00-\x1f\x7f]/;
function mailbox(value: string): boolean {
  if (value.length > 254 || controls.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length <= 64 && /^[A-Za-z0-9!#$%&'*+\-\/=?^_`{}~]+(?:\.[A-Za-z0-9!#$%&'*+\-\/=?^_`{}~]+)*$/.test(local) &&
    domain.includes('.') && domain.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
// Compatibility identity only: this unsigned cookie does NOT verify ownership.
export function analysisRecipient(cookie: string | undefined): string {
  if (!cookie || cookie.length > 2048) return fail(401, 'Sign in with a valid email to request analysis.');
  let decoded: string;
  try { decoded = decodeURIComponent(cookie); } catch { return fail(401, 'Invalid sign-in cookie.'); }
  const parts = decoded.split('|');
  if (parts.length !== 2 || controls.test(decoded) || !parts[0].trim() || parts[0].length > 200 || !mailbox(parts[1])) return fail(401, 'Invalid sign-in cookie.');
  return parts[1];
}
export function analysisConfig() {
  const env = process.env;
  if (env.ANALYSIS_BACKGROUND_ENABLED !== 'true' || env.ANALYSIS_RUNTIME_SECONDS !== '300' || !env.OPENROUTER_API_KEY?.trim() || !env.RESEND_API_KEY?.trim()) return fail(503, 'Background analysis is not configured.');
  const from = env.ANALYSIS_FROM_EMAIL || env.SIGNUP_FROM_EMAIL || '';
  const match = /^([\p{L}\p{N} ._'\-]+) <([^<>]+)>$/u.exec(from);
  const address = match ? match[2] : from;
  if (controls.test(from) || from.length > 400 || !mailbox(address) || /(?:^|\.)resend\.dev$/i.test(address.split('@')[1])) return fail(503, 'Analysis email sender is not configured.');
  let endpoint = 'https://api.resend.com/emails';
  if (env.ANALYSIS_TEST_EMAIL_URL) {
    let url: URL;
    try { url = new URL(env.ANALYSIS_TEST_EMAIL_URL); } catch { return fail(503, 'Invalid local email test configuration.'); }
    if (env.VERCEL || env.ANALYSIS_LOCAL_TEST !== 'true' || !['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash) return fail(503, 'Invalid local email test configuration.');
    endpoint = url.href;
  }
  return { from, endpoint, apiKey: env.RESEND_API_KEY };
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function analysisBody(body: unknown) {
  if (!object(body) || Object.keys(body).some(k => !['companySlug', 'requestId', 'options'].includes(k)) || typeof body.companySlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.companySlug) || body.companySlug.length > 200 || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return fail(400, 'A single company and UUID requestId are required.');
  const raw = body.options === undefined ? {} : body.options;
  if (!object(raw) || Object.keys(raw).some(k => !['model', 'maxOutputTokens', 'maxTokens', 'temperature', 'topP', 'stop'].includes(k))) return fail(400, 'Invalid analysis options.');
  const env = process.env;
  const model = raw.model ?? env.OPENROUTER_MODEL ?? 'openai/gpt-6-astra';
  const maxOutputTokens = raw.maxOutputTokens ?? raw.maxTokens ?? Number(env.OPENROUTER_MAX_OUTPUT_TOKENS ?? 8000);
  const temperature = raw.temperature ?? (env.OPENROUTER_TEMPERATURE === undefined ? undefined : Number(env.OPENROUTER_TEMPERATURE));
  const topP = raw.topP ?? (env.OPENROUTER_TOP_P === undefined ? undefined : Number(env.OPENROUTER_TOP_P));
  const stop = raw.stop ?? (env.OPENROUTER_STOP ? env.OPENROUTER_STOP.split(',').map(s => s.trim()).filter(Boolean) : undefined);
  if (Object.values(raw).some(v => v === null) || typeof model !== 'string' || !model.trim() || model.length > 200 || controls.test(model) || typeof maxOutputTokens !== 'number' || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8000 || (raw.maxTokens !== undefined && raw.maxOutputTokens !== undefined && raw.maxTokens !== raw.maxOutputTokens) || (temperature !== undefined && (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) || (topP !== undefined && (typeof topP !== 'number' || !Number.isFinite(topP) || topP < 0 || topP > 1)) || (stop !== undefined && (!Array.isArray(stop) || stop.length > 4 || stop.some(s => typeof s !== 'string' || !s.length || s.length > 200)))) return fail(400, 'Invalid analysis options.');
  const options: LLMOptions = { model, maxOutputTokens, temperature: temperature as number | undefined, topP: topP as number | undefined, stop: stop as string[] | undefined };
  return { companySlug: body.companySlug, requestId: body.requestId.toLowerCase(), options };
}
const requests = new Map<string, { binding: string; expires: number }>();
const recipients = new Map<string, number>();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// Best effort per warm instance ONLY; no report cache, durability or global limit.
export function reserveAnalysis(requestId: string, company: string, recipient: string, options: LLMOptions) {
  const now = Date.now();
  for (const [key, value] of requests) if (value.expires <= now) requests.delete(key);
  for (const [key, expiry] of recipients) if (expiry <= now) recipients.delete(key);
  const binding = hash(JSON.stringify([company, recipient, options]));
  const key = `analysis-${hash(JSON.stringify([requestId, binding]))}`;
  const previous = requests.get(requestId);
  if (previous) {
    if (previous.binding !== binding) return fail(409, 'requestId is already bound to another request.');
    return { duplicate: true, key, release: () => {} };
  }
  const recipientKey = hash(recipient.toLowerCase());
  if (recipients.has(recipientKey)) return fail(429, 'Please wait a minute before requesting another analysis.');
  if (requests.size >= 1000 || recipients.size >= 1000) return fail(503, 'Analysis is busy. Please try later.');
  requests.set(requestId, { binding, expires: now + 86400000 });
  recipients.set(recipientKey, now + 60000);
  return { duplicate: false, key, release: () => { requests.delete(requestId); recipients.delete(recipientKey); } };
}
export async function emailAnalysis(config: ReturnType<typeof analysisConfig>, recipient: string, companyName: string, key: string, generate: () => Promise<string>, deadline: number) {
  const subjectName = companyName.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120);
  async function send(text: string, failure: boolean) {
    const remaining = Math.min(10000, deadline - Date.now() - 5000);
    if (remaining <= 0) throw new Error('Delivery deadline elapsed');
    const response = await fetch(config.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(remaining),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${key}-${failure ? 'failure' : 'success'}` },
      body: JSON.stringify({ from: config.from, to: recipient, subject: `${failure ? 'Analysis could not be completed' : 'Your analysis'}: ${subjectName}`, text }),
    });
    if (!response.ok) throw new Error('Email delivery failed');
  }
  let stage = 'generation';
  try {
    const output = await generate();
    if (!output.trim()) throw new Error('Empty analysis');
    stage = 'report_delivery';
    await send(output, false);
  } catch {
    // Only an opaque reservation key and fixed categories, never error objects.
    console.error('[analysis]', { key, stage, outcome: 'failed' });
    try { await send('We could not complete or deliver your requested analysis. Please return to HelmerBot and try again later. If this continues, contact the site operator.', true); }
    catch { console.error('[analysis]', { key, stage: 'failure_notification', outcome: 'failed' }); }
  }
}
