import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const id = '12345678-1234-4234-8234-123456789abc';
const otherId = '22345678-1234-4234-8234-123456789abc';
function harness({ env = {}, generate, mail, dataset, clock = () => Date.now(), fastTimeout = false, scheduleError = false } = {}) {
  const jobs = [], calls = [], logs = [], timeouts = [];
  const timers = new Set();
  const environment = { ANALYSIS_BACKGROUND_ENABLED: 'true', ANALYSIS_RUNTIME_SECONDS: '300', OPENROUTER_API_KEY: 'offline', RESEND_API_KEY: 'offline', ANALYSIS_FROM_EMAIL: 'HelmerBot <reports@example.com>', ...env };
  const modules = {};
  function load(path) {
    if (modules[path]) return modules[path];
    const context = { exports: {}, Buffer, URL, TextDecoder, AbortController, setTimeout: (cb, ms) => { const timer = setTimeout(() => { timers.delete(timer); cb(); }, fastTimeout ? 5 : ms); timers.add(timer); return timer; }, clearTimeout: timer => { timers.delete(timer); clearTimeout(timer); }, AbortSignal: { timeout: ms => { timeouts.push(ms); return AbortSignal.timeout(fastTimeout ? 5 : ms); } }, Date: class extends Date { static now() { return clock(); } }, process: { env: environment }, console: { error: (...x) => logs.push(x), log: (...x) => logs.push(x) }, fetch: async (url, init) => { calls.push({ url, ...init, body: JSON.parse(init.body) }); return mail ? mail(url, init, calls.length) : new Response('{}'); }, require: name => {
      if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) }, after: cb => { if (scheduleError) throw new Error('scheduler unavailable'); jobs.push(cb); } };
      if (name === '@/lib/dataset') return { getDataset: dataset ?? (async () => ({ companies: [{ slug: 'acme', name: 'Acme\r\nInjected', industry: 'Software' }, { slug: 'other', name: 'Other' }] })) };
      if (name === '@/lib/prompt') return { makePrompt: c => `prompt:${c.slug}` };
      if (name === '@/lib/llm') return { getLLM: () => ({ generate: async (...args) => { calls.push({ generation: args }); return generate ? generate(...args) : 'FULL REPORT\n<html>plain text</html>'; } }) };
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      return require(name);
    } };
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
    return modules[path] = context.exports;
  }
  const route = load('app/api/analysis/route.ts');
  function request(body = { companySlug: 'acme', requestId: id }, { cookie = encodeURIComponent('Name|user@example.com'), origin = 'https://app.example', host = 'app.example', url = 'https://app.example/api/analysis', headers: extraHeaders = {}, type = 'application/json', raw } = {}) {
    const headers = new Headers({ 'content-type': type, ...extraHeaders });
    if (origin !== null) headers.set('origin', origin);
    if (host !== null) headers.set('host', host);
    const req = new Request(url, { method: 'POST', headers, body: raw ?? JSON.stringify(body), duplex: 'half' });
    req.cookies = { get: () => cookie === null ? undefined : { value: cookie } };
    return route.POST(req);
  }
  return { request, jobs, calls, logs, timeouts, timers, route };
}
test('202 schedules server-owned work without generating inline, then emails full plaintext', async () => {
  const h = harness(); const response = await h.request();
  assert.equal(response.status, 202); assert.equal(h.route.maxDuration, 300);
  const body = await response.json(); assert.equal(body.requestId, id); assert.equal('output' in body, false);
  assert.equal(h.calls.length, 0); assert.equal(h.jobs.length, 1);
  await h.jobs[0]();
  const [generation, email] = h.calls;
  assert.equal(generation.generation[0], 'prompt:acme');
  assert.ok(generation.generation[1].signal instanceof AbortSignal);
  assert.equal(email.body.to, 'user@example.com');
  assert.equal(email.body.text, 'FULL REPORT\n<html>plain text</html>');
  assert.equal('html' in email.body, false); assert.doesNotMatch(email.body.subject, /[\r\n]/);
  assert.match(email.headers['Idempotency-Key'], /^analysis-[a-f0-9]{64}-success$/);
  assert.deepEqual(h.timeouts, [240000, 10000]);
});
for (const cookie of [null, '%ZZ', 'Name', encodeURIComponent('Name|a@example.com|b@example.com'), encodeURIComponent('Name|a@example.com,b@example.com'), encodeURIComponent('Name|a@example.com\r\nBcc:x@y.com'), encodeURIComponent('Na\nme|a@example.com'), encodeURIComponent('Name|a..b@example.com'), encodeURIComponent('Name|a@-example.com')]) test(`reject cookie ${cookie}`, async () => { const h = harness(); assert.equal((await h.request(undefined, { cookie })).status, 401); assert.equal(h.jobs.length, 0); });
for (const env of [{ ANALYSIS_BACKGROUND_ENABLED: '' }, { ANALYSIS_RUNTIME_SECONDS: '299' }, { RESEND_API_KEY: '' }, { OPENROUTER_API_KEY: '' }, { ANALYSIS_FROM_EMAIL: '' }, { ANALYSIS_FROM_EMAIL: 'onboarding@resend.dev' }, { ANALYSIS_FROM_EMAIL: 'App <a@sub.resend.dev>' }, { ANALYSIS_FROM_EMAIL: 'bad\r\n@example.com' }, { ANALYSIS_FROM_EMAIL: 'other@example.com, App <reports@example.com>' }, { ANALYSIS_FROM_EMAIL: 'App; Bcc: victim@example.com <reports@example.com>' }, { ANALYSIS_TEST_EMAIL_URL: 'https://example.com/emails', ANALYSIS_LOCAL_TEST: 'true' }, { ANALYSIS_TEST_EMAIL_URL: 'http://127.0.0.1:9999/emails', ANALYSIS_LOCAL_TEST: 'true', VERCEL: '1' }, { ANALYSIS_TEST_EMAIL_URL: 'http://127.0.0.1:9999/emails' }]) test(`fail closed config ${JSON.stringify(env)}`, async () => { const h = harness({ env }); assert.equal((await h.request()).status, 503); assert.equal(h.jobs.length, 0); });
for (const body of [{ companySlug: ['acme'], requestId: id }, { companySlug: 'acme' }, { companySlug: 'acme', requestId: 'bad' }, ...[null, [], { maxTokens: 8001 }, { maxTokens: 1.5 }, { maxOutputTokens: 0 }, { maxTokens: 10, maxOutputTokens: 20 }, { temperature: 3 }, { topP: -1 }, { stop: ['x'.repeat(201)] }, { stop: Array(5).fill('a') }, { model: 'x'.repeat(201) }, { model: 'bad\nmodel' }, { unknown: 1 }].map(options => ({ companySlug: 'acme', requestId: id, options })), { companySlug: 'acme', requestId: id, email: 'attacker@example.com' }]) test(`invalid body ${JSON.stringify(body)}`, async () => { const h = harness(); assert.equal((await h.request(body)).status, 400); assert.equal(h.jobs.length, 0); });
test('origin, media type, size, JSON and unknown company are rejected', async () => {
  const h = harness();
  assert.equal((await h.request(undefined, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.request(undefined, { type: 'text/plain' })).status, 415);
  assert.equal((await h.request(undefined, { raw: 'x'.repeat(17000) })).status, 413);
  assert.equal((await h.request(undefined, { raw: '{' })).status, 400);
  assert.equal((await h.request({ companySlug: 'missing', requestId: id })).status, 404);
  assert.equal(h.jobs.length, 0);
});
test('installed Next normalizes loopback URL but same-origin browser request is accepted', async () => {
  const { NextRequest } = require('next/server');
  const req = new NextRequest('http://127.0.0.1:4317/api/analysis', { method: 'POST', headers: { host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4317', 'content-type': 'application/json', cookie: `hb_user=${encodeURIComponent('Name|user@example.com')}` }, body: JSON.stringify({ companySlug: 'acme', requestId: id }) });
  assert.equal(new URL(req.url).hostname, 'localhost');
  const h = harness();
  assert.equal((await h.route.POST(req)).status, 202);
  assert.equal(h.jobs.length, 1); assert.equal(h.calls.length, 0);
});
for (const options of [
  { url: 'http://localhost:4317/api/analysis', host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4317' },
  { url: 'http://localhost:4317/api/analysis', host: '[::1]:4317', origin: 'http://[::1]:4317' },
  { url: 'https://internal:3000/api/analysis', host: 'app.example', origin: 'https://app.example' },
  { host: 'APP.EXAMPLE:443', origin: 'https://app.example' },
]) test(`same-origin uses Host authority and Next protocol: ${JSON.stringify(options)}`, async () => {
  const h = harness(); assert.equal((await h.request(undefined, options)).status, 202);
  assert.equal(h.jobs.length, 1); assert.equal(h.calls.length, 0);
});
for (const options of [
  ...[null, '', 'evil.example', 'app.example, evil.example', 'app.example, app.example', 'app.example/path', 'app.example?', 'app.example#', 'user@app.example', 'app.example\\evil', 'app.example:bad', 'app.example:99999', 'app.example:', 'app.example:0443', 'app%2eexample', '[::1', 'app.example internal'].map(host => ({ host })),
  ...[null, '', 'null', 'https://evil.example', 'https://app.example:444', 'http://app.example', 'https://app.example/', 'https://app.example https://evil.example', 'https://user@app.example'].map(origin => ({ origin })),
  { origin: 'https://evil.example', headers: { 'x-forwarded-host': 'evil.example' } },
  { host: null, headers: { 'x-forwarded-host': 'app.example' } },
  { origin: 'http://app.example', headers: { 'x-forwarded-proto': 'http' } },
  { url: 'http://internal:3000/api/analysis', headers: { 'x-forwarded-proto': 'https' } },
  { url: 'ftp://app.example/api/analysis', origin: 'ftp://app.example' },
]) test(`same-origin fails closed without work: ${JSON.stringify(options)}`, async () => {
  const h = harness(); const response = await h.request(undefined, options);
  assert.equal(response.status, 403); assert.equal((await response.json()).error, 'Same-origin request required.');
  assert.equal(h.jobs.length, 0); assert.equal(h.calls.length, 0);
});
test('duplicates bind request ID to recipient/company/options; recipient cooldown applies', async () => {
  const h = harness(); assert.equal((await h.request()).status, 202);
  assert.equal((await h.request()).status, 202); assert.equal(h.jobs.length, 1);
  for (const body of [{ companySlug: 'other', requestId: id }, { companySlug: 'acme', requestId: id, options: { maxTokens: 100 } }]) assert.equal((await h.request(body)).status, 409);
  assert.equal((await h.request(undefined, { cookie: encodeURIComponent('Name|other@example.com') })).status, 409);
  assert.equal((await h.request({ companySlug: 'acme', requestId: otherId })).status, 429);
});
test('options alias normalizes; local test mail override and sender fallback remain authenticated', async () => {
  const h = harness({ env: { ANALYSIS_FROM_EMAIL: '', SIGNUP_FROM_EMAIL: 'reports@example.com', ANALYSIS_LOCAL_TEST: 'true', ANALYSIS_TEST_EMAIL_URL: 'http://127.0.0.1:9999/emails' } });
  assert.equal((await h.request({ companySlug: 'acme', requestId: id, options: { model: 'custom/model', maxTokens: 120, temperature: 0, topP: 1, stop: ['END'] } })).status, 202);
  await h.jobs[0](); assert.equal(h.calls[0].generation[1].maxOutputTokens, 120); assert.equal(h.calls[1].url, 'http://127.0.0.1:9999/emails'); assert.equal(h.calls[1].headers.Authorization, 'Bearer offline');
});
test('real abort events bound hung generation and both mail attempts', async () => {
  const aborted = signal => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error('abort did not fire')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
  });
  const generation = harness({ fastTimeout: true, generate: (_prompt, options) => aborted(options.signal) });
  assert.equal((await generation.request()).status, 202); await generation.jobs[0]();
  assert.match(generation.calls[1].body.text, /could not/); assert.deepEqual(generation.timeouts, [240000, 10000]);
  const mail = harness({ fastTimeout: true, mail: (_url, init) => aborted(init.signal) });
  assert.equal((await mail.request()).status, 202); await mail.jobs[0]();
  assert.deepEqual(mail.timeouts, [240000, 10000, 10000]); assert.equal(mail.logs.length, 2);
});
test('scheduler failures release reservation rather than falsely accepting a retry', async () => {
  const h = harness({ scheduleError: true });
  assert.equal((await h.request()).status, 503); assert.equal((await h.request()).status, 503); assert.equal(h.jobs.length, 0);
});
test('recipient cooldown expires, while request deduplication survives until TTL', async () => {
  let now = 0; const h = harness({ clock: () => now });
  assert.equal((await h.request()).status, 202); now = 60001;
  assert.equal((await h.request({ companySlug: 'acme', requestId: otherId })).status, 202);
  assert.equal((await h.request()).status, 202); assert.equal(h.jobs.length, 2);
  now = 86400001; assert.equal((await h.request()).status, 202); assert.equal(h.jobs.length, 3);
});
test('instance reservation store refuses overflow and recovers after expiry', async () => {
  let now = 0; const h = harness({ clock: () => now });
  for (let n = 0; n < 1000; n++) {
    const requestId = `${n.toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`;
    assert.equal((await h.request({ companySlug: 'acme', requestId }, { cookie: encodeURIComponent(`Name|user${n}@example.com`) })).status, 202);
  }
  assert.equal((await h.request()).status, 503); now = 86400001;
  assert.equal((await h.request()).status, 202);
});
for (const failure of ['generation', 'timeout', 'email', 'both']) test(`async ${failure} failure uses generic notification without leaking`, async () => {
  const h = harness({ env: { RESEND_API_KEY: 'SECRET_MAIL_KEY', OPENROUTER_API_KEY: 'SECRET_LLM_KEY' }, generate: failure === 'generation' || failure === 'timeout' ? async () => { throw new Error('SECRET RAW OUTPUT user@example.com'); } : undefined, mail: async (_url, _init, n) => { if (failure === 'both' || failure === 'email' && n === 2) throw new Error('SECRET'); return new Response('{}'); } });
  assert.equal((await h.request()).status, 202); await h.jobs[0]();
  const emails = h.calls.filter(c => c.body); assert.match(emails.at(-1).body.text, /could not|unable|failed/i); assert.doesNotMatch(emails.at(-1).body.text, /SECRET|RAW OUTPUT/);
  assert.match(emails.at(-1).headers['Idempotency-Key'], /-failure$/); assert.doesNotMatch(JSON.stringify(h.logs), /SECRET|user@example.com|FULL REPORT/);
  const key = emails.at(-1).headers['Idempotency-Key'].replace(/-failure$/, '');
  assert.ok(h.logs[0], 'original background failure must be logged even if notification succeeds');
  assert.deepEqual(JSON.parse(JSON.stringify(h.logs[0])), ['[analysis]', { key, stage: ['generation', 'timeout'].includes(failure) ? 'generation' : 'report_delivery', outcome: 'failed' }]);
  if (failure === 'both') assert.deepEqual(JSON.parse(JSON.stringify(h.logs[1])), ['[analysis]', { key, stage: 'failure_notification', outcome: 'failed' }]);
});

test('slow real request stream is cancelled and unlocked within preparation deadline', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  const h = harness({ fastTimeout: true });
  const pending = h.request(undefined, { raw: stream });
  // Baseline safety guard also prevents a broken implementation hanging the suite.
  let guard;
  try {
    const response = await Promise.race([pending, new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('preparation never timed out')), 100); })]);
    assert.equal(response.status, 503); assert.equal(cancelled, true); assert.equal(stream.locked, false);
    assert.equal(h.jobs.length, 0); assert.equal(h.timers.size, 0);
    assert.equal((await h.request()).status, 202);
  } finally { clearTimeout(guard); }
});

test('dataset deadline rejects before scheduling and observes late rejection', async () => {
  let rejectDataset;
  const h = harness({ fastTimeout: true, dataset: () => new Promise((_, reject) => { rejectDataset = reject; }) });
  let guard;
  try {
    const response = await Promise.race([h.request(), new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('dataset never timed out')), 100); })]);
    assert.equal(response.status, 503); assert.equal(h.jobs.length, 0); assert.equal(h.timers.size, 0);
  } finally { clearTimeout(guard); rejectDataset(new Error('late private dataset error')); }
  await new Promise(resolve => setImmediate(resolve));
});

test('clock jump during preparation rejects without reserving or scheduling', async () => {
  let now = 0, jump = true;
  const h = harness({ clock: () => now, dataset: async () => { if (jump) now += 280000; return { companies: [{ slug: 'acme', name: 'Acme' }] }; } });
  assert.equal((await h.request()).status, 503); assert.equal(h.jobs.length, 0); assert.equal(h.timers.size, 0);
  jump = false; assert.equal((await h.request()).status, 202);
});

test('delayed callback caps generation against original route deadline', async () => {
  let now = 0; const h = harness({ clock: () => now });
  assert.equal((await h.request()).status, 202); now = 100000; await h.jobs[0]();
  assert.equal(h.timeouts[0], 175000); assert.equal(h.timers.size, 0);
});

test('clock jump immediately before scheduling releases the reservation', async () => {
  let now = 0, accesses = 0, jump = true;
  const company = { name: 'Acme', get slug() { if (++accesses === 2 && jump) now += 40000; return 'acme'; } };
  const h = harness({ clock: () => now, dataset: async () => ({ companies: [company] }) });
  assert.equal((await h.request()).status, 503); assert.equal(h.jobs.length, 0);
  jump = false; assert.equal((await h.request()).status, 202); assert.equal(h.jobs.length, 1);
});

test('callback past runtime deadline logs both failures without starting network work', async () => {
  let now = 0; const h = harness({ clock: () => now });
  assert.equal((await h.request()).status, 202); now = 300000; await h.jobs[0]();
  assert.equal(h.calls.length, 0); assert.equal(h.logs.length, 2);
  assert.equal(h.logs[0][1].stage, 'generation'); assert.equal(h.logs[1][1].stage, 'failure_notification');
});

test('callback too late for generation sends only graceful failure notification', async () => {
  let now = 0; const h = harness({ clock: () => now });
  assert.equal((await h.request()).status, 202); now = 280000; await h.jobs[0]();
  assert.equal(h.calls.some(c => c.generation), false); assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].headers['Idempotency-Key'], /-failure$/);
});
