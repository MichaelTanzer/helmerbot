// Local-only manual browser fixture. Never contacts a provider or reads credentials.
// Run: node tests/email-mock.mjs 4318 /absolute/path/receipts.jsonl
// /responses waits for POST /release; /emails records synthetic messages.
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const port = Number(process.argv[2] || 4318);
const receiptPath = process.argv[3];
if (!receiptPath) throw new Error('An explicit receipt path is required');
const pending = [];
const record = event => appendFileSync(receiptPath, JSON.stringify({ at: Date.now(), ...event }) + '\n');
const report = 'OFFLINE FULL REPORT\n1. Business models\n2. Seven Powers\n3. Flywheel\n<script>untrusted output stays plain text</script>\nEND REPORT';
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end('{"ok":true}');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('{}'); }
  if (req.url === '/responses') {
    const data = JSON.parse(body);
    record({ kind: 'generation_requested', model: data.model, max_output_tokens: data.max_output_tokens });
    pending.push(res);
    return;
  }
  if (req.url === '/release') {
    const fail = body && JSON.parse(body).fail === true;
    record({ kind: 'released', pending: pending.length, fail: !!fail });
    for (const response of pending.splice(0)) {
      response.statusCode = fail ? 503 : 200;
      response.end(JSON.stringify(fail ? { error: { message: 'offline provider failure' } } : { status: 'completed', output: [{ content: [{ type: 'output_text', text: report }] }] }));
    }
    return res.end('{"ok":true}');
  }
  if (req.url === '/emails') {
    record({ kind: 'email_received', body: JSON.parse(body), idempotencyKey: req.headers['idempotency-key'] });
    return res.end('{"id":"offline-email-receipt"}');
  }
  res.statusCode = 404; res.end('{}');
});
server.listen(port, '127.0.0.1', () => console.log(`Offline mock ready on 127.0.0.1:${port}`));
