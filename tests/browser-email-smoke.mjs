// Offline-only real Chromium smoke for an already-running local app + email-mock.
// Usage: node tests/browser-email-smoke.mjs /absolute/evidence-dir
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const out = process.argv[2];
if (!out || !path.isAbsolute(out)) throw new Error('Absolute evidence directory required');
mkdirSync(out, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = spawn('/opt/google/chrome/chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=4320', `--user-data-dir=${path.join(out, 'owned-chrome-profile')}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
let ws;
const receipts = () => existsSync(path.join(out, 'browser-receipts.jsonl')) ? readFileSync(path.join(out, 'browser-receipts.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const evidence = { startedAt: Date.now(), consoleErrors: [], cases: [] };
try {
  let version;
  for (let n = 0; n < 50; n++) {
    try { version = await (await fetch('http://127.0.0.1:4320/json/version')).json(); break; } catch { await pause(100); }
  }
  assert.ok(version?.webSocketDebuggerUrl, 'Owned Chrome ready');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await once(ws, 'open');
  let seq = 0;
  const waiting = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') evidence.consoleErrors.push(message.params.exceptionDetails.text);
    if (!message.id) return;
    const entry = waiting.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); waiting.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
  });
  const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} timeout`)); }, 15000);
    waiting.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const evaluate = async (session, expression) => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitText = async (session, text) => {
    for (let n = 0; n < 100; n++) {
      if ((await evaluate(session, 'document.body.innerText')).includes(text)) return;
      await pause(100);
    }
    throw new Error(`Expected text not found: ${text}`);
  };
  const page = async cookie => {
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    await cdp('Page.enable', {}, sessionId); await cdp('Runtime.enable', {}, sessionId);
    await cdp('Network.setCookie', { name: 'hb_user', value: cookie, url: 'http://127.0.0.1:4317', httpOnly: true, sameSite: 'Lax' }, sessionId);
    await cdp('Page.navigate', { url: 'http://127.0.0.1:4317/company/8x8-inc' }, sessionId);
    await waitText(sessionId, 'Run Analysis');
    // The server-rendered button precedes client hydration; wait for load first.
    for (let n = 0; n < 100 && await evaluate(sessionId, 'document.readyState') !== 'complete'; n++) await pause(100);
    await pause(500);
    return { targetId, sessionId };
  };
  const shot = async (sessionId, name) => {
    const image = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(path.join(out, name), Buffer.from(image.data, 'base64'));
  };
  const close = async targetId => {
    assert.equal((await cdp('Target.closeTarget', { targetId })).success, true);
    assert.equal((await cdp('Target.getTargets')).targetInfos.some(t => t.targetId === targetId), false);
    return Date.now();
  };
  for (const failure of [false, true]) {
    const recipient = `offline-${failure ? 'failure' : 'success'}-${evidence.startedAt}@example.com`;
    const before = receipts().filter(r => r.kind === 'generation_requested').length;
    const { targetId, sessionId } = await page(encodeURIComponent(`Offline Tester|${recipient}`));
    await cdp('Page.reload', {}, sessionId); await waitText(sessionId, 'Run Analysis'); await pause(300);
    assert.equal(receipts().filter(r => r.kind === 'generation_requested').length, before, 'navigation/reload sends nothing');
    await shot(sessionId, failure ? 'failure-before.png' : 'confirmation.png');
    await evaluate(sessionId, "document.querySelector('article button').click(); document.querySelector('article button').click()");
    await waitText(sessionId, 'You may close this tab');
    const text = await evaluate(sessionId, 'document.body.innerText');
    const network = await evaluate(sessionId, "performance.getEntriesByType('resource').filter(e=>e.name.endsWith('/api/analysis')).map(e=>({status:e.responseStatus,duration:e.duration}))");
    assert.equal(network.length, 1); assert.equal(network[0].status, 202);
    assert.equal(text.includes('OFFLINE FULL REPORT'), false);
    await shot(sessionId, failure ? 'failure-accepted.png' : 'accepted-owned.png');
    const closedAt = await close(targetId);
    await fetch('http://127.0.0.1:4318/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fail: failure }) });
    let email;
    for (let n = 0; n < 100; n++) {
      email = receipts().find(r => r.kind === 'email_received' && r.body.to === recipient);
      if (email) break; await pause(100);
    }
    assert.ok(email && email.at > closedAt, 'mock email received after tab closed');
    assert.equal('html' in email.body, false);
    assert.equal(email.body.from, 'reports@example.com');
    if (failure) assert.match(email.body.text, /could not complete/);
    else assert.equal(email.body.text, 'OFFLINE FULL REPORT\n1. Business models\n2. Seven Powers\n3. Flywheel\n<script>untrusted output stays plain text</script>\nEND REPORT');
    assert.equal(receipts().filter(r => r.kind === 'generation_requested').length, before + 1);
    evidence.cases.push({ case: failure ? 'provider_failure' : 'success', network, closedAt, emailReceivedAt: email.at, recipient, text });
    writeFileSync(path.join(out, 'browser-smoke.json'), JSON.stringify(evidence, null, 2));
  }
  const bad = await page('malformed');
  await evaluate(bad.sessionId, "document.querySelector('article button').click()");
  await waitText(bad.sessionId, 'Error: Invalid sign-in cookie.');
  const rejectedText = await evaluate(bad.sessionId, 'document.body.innerText');
  assert.equal(rejectedText.includes('Request accepted'), false);
  await shot(bad.sessionId, 'rejected-cookie.png');
  await close(bad.targetId);
  evidence.cases.push({ case: 'invalid_cookie_visible_error', text: rejectedText });
  assert.deepEqual(evidence.consoleErrors, []);
  evidence.passed = true;
  writeFileSync(path.join(out, 'browser-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  ws?.close(); chrome.kill('SIGTERM');
  const stopped = await Promise.race([once(chrome, 'exit').then(() => true), pause(3000).then(() => false)]);
  if (!stopped) { chrome.kill('SIGKILL'); await once(chrome, 'exit'); }
}
