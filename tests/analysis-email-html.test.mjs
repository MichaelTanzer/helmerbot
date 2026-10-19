import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../lib/analysis-email-html.ts', import.meta.url), 'utf8');
const context = { exports: {}, URL };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
const { renderAnalysisEmailHtml } = context.exports;
// 03:30 UTC is still the previous evening in New York, proving the explicit timezone.
const date = new Date('2026-10-19T03:30:00Z');
const render = (text, extra = {}) => renderAnalysisEmailHtml({ text, companyName: 'Acme', date, ...extra });
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// Visible text, with each anchor's href following its label (as in Markdown source order).
const visible = html => decode(html.replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, label) => `${label} ${href}`).replace(/<br>/g, '\n').replace(/<[^>]+>/g, ' '));
const words = s => s.match(/[\p{L}\p{N}]+/gu) ?? [];
function assertInOrder(html, text) {
  const out = words(visible(html.slice(html.indexOf('data-report'))));
  let i = 0;
  for (const w of words(text)) {
    while (i < out.length && out[i] !== w) i++;
    assert.ok(i < out.length, `missing or out of order: ${w}`); i++;
  }
}
function assertInert(html) {
  assert.doesNotMatch(html, /<(?:script|img|link|iframe|form|object|embed|style|input|button|svg|video|audio|base)\b/i);
  // Escaped payload text may legitimately mention these; only generated tags must not.
  for (const tag of html.match(/<[^>]*>/g) ?? []) assert.doesNotMatch(tag, /@import|url\(|\ssrc=|http-equiv|\son[a-z]+\s*=|javascript:|data:/i);
  for (const tag of html.match(/<a\b[^>]*>/g) ?? []) assert.match(tag, /^<a href="https?:\/\/[^"<>\s]+" style="[^"<>]*">$/);
}
const fixture = [
  '# 7 Powers and Flywheel Analysis',
  '',
  '## 1. Multi‑Year Business‑Model Diagnosis',
  'Acme blends **B2B Software** and *Marketplaces & Platforms* <script>alert(1)</script> models.',
  'This second line stays on its own line.',
  '',
  '- **Primary model:** B2B Software – gross margin 78% (FY2019→FY2024)',
  '  continuation line explaining the KPI with "quotes" & ampersands',
  '  - Nested attach rate 1.8× [10‑K](https://example.com/10k?a=1&b=2)',
  '- Hybrid pattern strengthened ↑',
  '',
  '**Notes**',
  '1. Companies blend models (7 + 8 + 10).',
  '3. Skipped number stays visible.',
  '',
  '---',
  '',
  '## 2. Hamilton Helmer "7 Powers" Analysis',
  '| Rank | Power | Score | Note |',
  '|---:|---|:---:|---|',
  '| 1 | Switching Costs | 5 | Deep ERP integration \\| sticky |',
  '| 2 | Network Economies | 4 | Extra cell kept | overflow |',
  '',
  ' [Power Name – Ranked #1]',
  ' - **Relevance Score** (0 – 5) – 5 for Acme',
  ' - **Trend Direction** – ↑ strengthening',
  '',
  '### 3. Fly‑Wheel Narrative',
  'Input Volume ↑ → Unit Cost ↓ → Price/Service Edge ↑ → Market Share ↑ → More Volume ↑',
  '',
  '┌──────────┐     ┌───────────┐',
  '│ Volume ↑ │ ──► │ Cost ↓    │',
  '└──────────┘     └───────────┘',
  '      ▲                │',
  '      └────────────────┘',
  '',
  '```text',
  'Raw   block   <b>kept</b>',
  '```',
  '',
  '## Sources',
  '- Acme 10‑K 2024: https://investors.example.com/acme/10-k-2024.pdf.',
  '- Bad: [click](javascript:alert(1)) and data:text/html,<img src=x onerror=alert(1)>',
  '- Unicode: 日本語 — café — 😀',
].join('\n');

test('analysis fixture keeps every word in order with styled sections, lists, table, diagram and sources', () => {
  const html = render(fixture);
  assertInOrder(html, fixture); assertInert(html);
  assert.match(html, /<h2[^>]*border-top:10px solid #000[^>]*>1\. Multi‑Year Business‑Model Diagnosis<\/h2>/);
  assert.match(html, /<strong>B2B Software<\/strong>/); assert.match(html, /<em>Marketplaces &amp; Platforms<\/em>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /models\.<br>This second line/);
  assert.match(html, /gross margin 78% \(FY2019→FY2024\)<br>continuation line explaining the KPI with &quot;quotes&quot; &amp; ampersands/);
  assert.match(html, /<a href="https:\/\/example\.com\/10k\?a=1&amp;b=2" style="[^"]*">10‑K<\/a>/);
  assert.match(html, />3\.<\/td>/); assert.match(html, />Notes</);
  assert.match(html, /<th[^>]*>Rank<\/th>/); assert.match(html, /<td[^>]*>Deep ERP integration \| sticky<\/td>/); assert.match(html, /<td[^>]*>overflow<\/td>/);
  assert.doesNotMatch(visible(html), /\|---/);
  for (const line of ['│ Volume ↑ │ ──► │ Cost ↓    │', '      └────────────────┘', 'Raw   block   &lt;b&gt;kept&lt;/b&gt;']) assert.ok(html.includes(line), line);
  assert.match(html, /<pre[^>]*white-space:pre-wrap/);
  assert.match(html, /<a href="https:\/\/investors\.example\.com\/acme\/10-k-2024\.pdf" style="[^"]*">https:\/\/investors\.example\.com\/acme\/10-k-2024\.pdf<\/a>\./);
  assert.ok(visible(html).includes('[click](javascript:alert(1)) and data:text/html,<img src=x onerror=alert(1)>'));
  assert.match(html, /日本語 — café — 😀/);
});

test('presentation shell is a responsive Georgia column with HelmerBot identity and fixed New York date', () => {
  const html = render('Body');
  for (const s of ['max-width:600px', 'width:100%', 'padding:0 15px', '#dcdcdc', 'Georgia', 'font-size:17px', 'line-height:25px', 'color:#333', 'font-size:28px', 'line-height:36px', 'font-size:24px', 'line-height:31px', 'Arial', 'font-size:13px', 'line-height:18px', 'name="viewport"']) assert.ok(html.includes(s), s);
  assert.match(html, />HelmerBot</); assert.match(html, /Generated by HelmerBot/);
  assert.match(html, /Sunday, October 18, 2026/);
  assert.doesNotMatch(html, /Morning Briefing|James|Lafarge/);
  assert.equal(html, render('Body')); assertInert(html);
});

test('failure notification uses the same shell with a truthful heading', () => {
  const text = 'We could not complete or deliver your requested analysis. Please return to HelmerBot and try again later.';
  const html = render(text, { failure: true });
  assert.match(html, /Analysis could not be completed/); assert.doesNotMatch(html, /Your analysis/);
  assertInOrder(html, text); assertInert(html);
});

test('malicious company names and raw HTML are escaped, never interpreted', () => {
  const companyName = '<img src=x onerror=alert(1)>"&\'\r\nBcc: x';
  const html = render('<a href="javascript:alert(1)" onclick="x()">hi</a>\n<div onmouseover=alert(1)>x</div>\n<style>@import url(//evil)</style>', { companyName });
  assertInert(html);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&amp;&#39;  Bcc: x'));
  assert.ok(visible(html).includes('<a href="javascript:alert(1)" onclick="x()">hi</a>'));
  assert.doesNotMatch(html, /[\x00-\x08\x0b-\x1f\x7f]/);
});

for (const link of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', '//evil.example/a', 'https:/evil.example', 'https:\\\\evil.example', 'https://user:pw@evil.example/', 'https://good.example@evil.example/', 'https://', 'https://%65vil.example/', 'https://evil‮.example/', 'https://evil.example\u0000/', 'vbscript:x', 'ftp://example.com/file', 'https://localhost/']) test(`unsafe link stays visible text: ${JSON.stringify(link)}`, () => {
  const html = render(`See [label](${link}) and <${link}> now`);
  assertInert(html); assert.doesNotMatch(html, /<a\b/);
  assert.ok(visible(html).includes(`See [label](${link.replace(/\u0000/g, '�')})`));
});

test('safe links are normalized and attribute-escaped; trailing punctuation stays text', () => {
  const html = render('Source (https://a.example/x?y="z"&q=\'1\'), and [doc](https://b.example/a"onclick="x).');
  assertInert(html);
  assert.match(html, /href="https:\/\/a\.example\/x\?y=%22z%22&amp;q=%271%27"/);
  assert.match(html, /href="https:\/\/b\.example\/a%22onclick=%22x"/);
  assert.match(html, /<\/a>\), and/); assert.match(html, /<\/a>\.<\/p>/);
});

test('empty, whitespace, no-Markdown, unclosed fence, controls and long reports are handled', () => {
  for (const text of ['', '  \n\t\n']) { const html = render(text); assert.doesNotMatch(html, /undefined|NaN|null/); assertInert(html); }
  const plain = render('Plain sentence one.\nPlain sentence two.');
  assert.match(plain, /<p[^>]*>Plain sentence one\.<br>Plain sentence two\.<\/p>/);
  const fence = render('```\ncode <x>\nmore');
  assert.match(fence, /<pre[^>]*>```\ncode &lt;x&gt;\nmore<\/pre>/);
  assert.match(render('bell\u0007 here'), /bell� here/);
  const long = Array.from({ length: 3000 }, (_, n) => n % 50 ? `- item token${n} https://x.example/${n}` : `## Section ${n}`).join('\n');
  const started = Date.now(); const html = render(long);
  assert.ok(Date.now() - started < 2000); assertInOrder(html, long); assertInert(html);
  assert.ok(html.includes('token2999'));
});

test('renderer is self-contained and pure', () => {
  assert.doesNotMatch(source, /\bimport\b|require\(|fetch|process\.|dangerouslySetInnerHTML/);
});
