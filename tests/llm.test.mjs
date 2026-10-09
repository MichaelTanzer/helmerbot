import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Compile the real client with the existing compiler; no credentials or network.
const source = ts.transpileModule(readFileSync(new URL('../lib/llm.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const completed = { status: 'completed', output: [{ content: [{ type: 'output_text', text: ' Analysis ' }] }] };

function client(env = {}, response = completed, status = 200) {
  const calls = [];
  const context = {
    exports: {},
    process: { env: { NODE_ENV: 'production', OPENROUTER_API_KEY: 'offline-test-only', ...env } },
    console,
    fetch: async (url, init) => {
      calls.push({ url, ...init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(response), { status });
    },
  };
  vm.runInNewContext(source, context);
  return { getLLM: context.exports.getLLM, calls };
}

test('defaults to Astra on the documented stable Responses endpoint', async () => {
  const { getLLM, calls } = client();
  assert.equal(await getLLM().generate('prompt'), 'Analysis');
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/responses');
  assert.deepEqual(calls[0].body, { model: 'openai/gpt-6-astra', input: 'prompt', max_output_tokens: 8000 });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer offline-test-only');
});

test('environment model and base override defaults', async () => {
  const { getLLM, calls } = client({ OPENROUTER_MODEL: 'anthropic/claude-sonnet-5.5', OPENROUTER_BASE: 'http://127.0.0.1:9999/api/v1/' });
  await getLLM().generate('prompt');
  assert.equal(calls[0].body.model, 'anthropic/claude-sonnet-5.5');
  assert.equal(calls[0].url, 'http://127.0.0.1:9999/api/v1/responses');
  assert.equal('temperature' in calls[0].body, false);
  assert.equal('top_p' in calls[0].body, false);
});

test('per-call Sonnet override takes precedence over environment', async () => {
  const { getLLM, calls } = client({ OPENROUTER_MODEL: 'openai/gpt-6-astra' });
  await getLLM().generate('prompt', { model: 'anthropic/claude-sonnet-5.5', maxOutputTokens: 200 });
  assert.equal(calls[0].body.model, 'anthropic/claude-sonnet-5.5');
  assert.equal(calls[0].body.max_output_tokens, 200);
});

test('preserves explicit generation settings for models that support them', async () => {
  const { getLLM, calls } = client({ OPENROUTER_MODEL: 'custom/compatible-model', OPENROUTER_TEMPERATURE: '0.7', OPENROUTER_TOP_P: '0.9', OPENROUTER_MAX_OUTPUT_TOKENS: '400', OPENROUTER_STOP: ' END, STOP ' });
  await getLLM().generate('prompt', { temperature: 0, topP: 0.8, maxOutputTokens: 123, stop: ['DONE'] });
  assert.deepEqual(calls[0].body, { model: 'custom/compatible-model', input: 'prompt', temperature: 0, top_p: 0.8, max_output_tokens: 123, stop: ['DONE'] });
});

test('joins only output text, not reasoning', async () => {
  const { getLLM } = client({}, { status: 'completed', output: [{ content: [{ type: 'reasoning_text', text: 'hidden' }, { type: 'output_text', text: 'First ' }] }, { content: [{ type: 'output_text', text: 'second' }] }] });
  assert.equal(await getLLM().generate('prompt'), 'First second');
});

for (const output of [[], [{ content: [{ type: 'output_text', text: '  ' }] }]]) {
  test(`rejects empty text instead of returning a blank analysis: ${JSON.stringify(output)}`, async () => {
    const { getLLM } = client({}, { status: 'completed', output });
    await assert.rejects(getLLM().generate('prompt'), /no text/i);
  });
}
for (const status of ['failed', 'incomplete', 'in_progress']) {
  test(`rejects ${status} responses even with partial text`, async () => {
    const { getLLM } = client({}, { ...completed, status });
    await assert.rejects(getLLM().generate('prompt'), /not completed/i);
  });
}

test('reports provider HTTP errors', async () => {
  const { getLLM } = client({}, { error: { message: 'Rate limited' } }, 429);
  await assert.rejects(getLLM().generate('prompt'), /HTTP 429/);
});

test('requires a key before any provider request', () => {
  const { getLLM, calls } = client({ OPENROUTER_API_KEY: '' });
  assert.throws(getLLM, /OPENROUTER_API_KEY is not set/);
  assert.equal(calls.length, 0);
});
