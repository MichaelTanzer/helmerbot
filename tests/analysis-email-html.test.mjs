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

test('a bold-only numbered line followed by prose is a black-rule section heading', () => {
  const text = '1. **Multi-Year Business-Model Diagnosis**\nRevenue grew.';
  const html = render(text);
  assertInOrder(html, text); assertInert(html);
  assert.match(html, /<h2[^>]*border-top:10px solid #000[^>]*>1\. Multi-Year Business-Model Diagnosis<\/h2>/);
  assert.match(html, /<p[^>]*>Revenue grew\.<\/p>/);
  assert.doesNotMatch(html, /<td[^>]*>1\.<\/td>/);
});

test('ordinary numbered items, bold labels with prose and list continuations stay lists', () => {
  const cases = [
    ['1. First point.\n2. Second point.', ['1.', '2.']],
    ['1. **Pricing power:** strong renewal rates.\nFollow-up prose.', ['1.']],
    ['1. **Alpha**\n2. **Beta**', ['1.', '2.']],
    ['1. **Revenue Growth**\n   continued detail', ['1.']],
    ['- intro\n1. **Label**\nmore item text', ['•', '1.']],
    ['- **Scale**\nprose continuation', ['•']],
  ];
  for (const [text, markers] of cases) {
    const html = render(text);
    assertInOrder(html, text); assertInert(html);
    assert.doesNotMatch(html, /<h2|<h3/, text);
    for (const marker of markers) assert.ok(html.includes(`>${marker}</td>`), `${text} -> ${marker}`);
  }
  assert.match(render('1. **Revenue Growth**\n   continued detail'), /<strong>Revenue Growth<\/strong><br>continued detail/);
  assert.match(render('- **Scale**\nprose continuation'), /<strong>Scale<\/strong><br>prose continuation/);
});

test('a box-drawing diagram after a list item keeps its preformatted layout', () => {
  const diagram = ['┌──────────┐     ┌───────────┐', '│ Volume ↑ │ ──► │ Cost ↓    │', '└──────────┘     └───────────┘', '      ▲                │', '      └────────────────┘'];
  const text = ['- Volume grows', ...diagram].join('\n');
  const html = render(text);
  assertInOrder(html, text); assertInert(html);
  assert.ok(html.includes(`<pre style="`), 'pre block');
  assert.ok(html.includes(`>${diagram.join('\n')}</pre>`), 'diagram lines intact');
  assert.match(html, /<td[^>]*>Volume grows<\/td>/);
});

// Bounded block grammar regression matrix. Each case is its own test so one failure never hides another.
// [name, text, black-rule h2 titles (as escaped HTML), HTML fragments that must appear in this order, patterns that must not appear]
const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ascii = ['    A     B', '    v     v', '    C --> D'];
const asciiPre = '>    A     B\n    v     v\n    C --&gt; D</pre>';
const blockCases = [
  ['numbered bold title directly before bullets', '2. **Flywheel Diagram**\n- Volume grows', ['2. Flywheel Diagram'], ['>2. Flywheel Diagram</h2>', '>•</td>', '>Volume grows</td>'], [/>2\.<\/td>/]],
  ['numbered bold title, blank line, then prose', '1. **Multi-Year Business-Model Diagnosis**\n\nRevenue grew.', ['1. Multi-Year Business-Model Diagnosis'], ['</h2>', '>Revenue grew.</p>'], [/<td/]],
  ['numbered bold title, blank lines, then bullets', '3. **Risks:**\n\n\n- Competition intensifies', ['3. Risks:'], ['>3. Risks:</h2>', '>Competition intensifies</td>'], [/>3\.<\/td>/]],
  ['successive titles including after earlier bullets', ['1. **Diagnosis**', '- Revenue grew', '- Margins rose', '2. **Flywheel Diagram**', '- Volume grows', '', '3. **Power Ranking**', '', 'Scale economies lead.', '4. **Outlook**', 'Stable.'].join('\n'),
    ['1. Diagnosis', '2. Flywheel Diagram', '3. Power Ranking', '4. Outlook'],
    ['>1. Diagnosis</h2>', '>Revenue grew</td>', '>Margins rose</td>', '>2. Flywheel Diagram</h2>', '>Volume grows</td>', '>3. Power Ranking</h2>', '>Scale economies lead.</p>', '>4. Outlook</h2>', '>Stable.</p>'], [/>[1-4]\.<\/td>/, /Margins rose<br>/]],
  ['ASCII diagram adjacent to a list item', ['- Loop', ...ascii].join('\n'), [], ['>Loop</td>', asciiPre], [/Loop<br>/]],
  ['ASCII diagram after title and bullet, then prose', ['2. **Flywheel Diagram**', '- Loop', ...ascii, '', 'Volume compounds.'].join('\n'), ['2. Flywheel Diagram'], ['</h2>', '>Loop</td>', asciiPre, '>Volume compounds.</p>'], [/Loop<br>/]],
  ['title text and following bullet are escaped', '4. **R&D <b>Moat</b>**\n- Patents & "trade" secrets', ['4. R&amp;D &lt;b&gt;Moat&lt;/b&gt;'], ['</h2>', '>Patents &amp; &quot;trade&quot; secrets</td>'], [/<b>/]],
  // Controls: these must keep their ordinary list/paragraph semantics.
  ['control: adjacent all-bold ordered items', '1. **Alpha**\n2. **Beta**\n3. **Gamma**', [], ['>1.</td>', '<strong>Alpha</strong>', '>2.</td>', '<strong>Beta</strong>', '>3.</td>', '<strong>Gamma</strong>'], []],
  ['control: loose all-bold ordered items', '1. **Alpha**\n\n2. **Beta**', [], ['>1.</td>', '<strong>Alpha</strong>', '>2.</td>', '<strong>Beta</strong>'], []],
  ['control: bold ordered item with nested bullet', '1. **Alpha**\n   - nested detail', [], ['>1.</td>', '<strong>Alpha</strong>', '>◦</td>', '>nested detail</td>'], []],
  ['control: bold ordered item inside a bullet list without section numbering', '- intro\n1. **Label**\n- more', [], ['>•</td>', '>intro</td>', '>1.</td>', '<strong>Label</strong>', '>more</td>'], []],
  ['control: unindented continuation inside a list', '- intro\n1. **Label**\nmore item text', [], ['>intro</td>', '>1.</td>', '<strong>Label</strong><br>more item text'], []],
  ['control: indented continuation prose', '- **Scale**\n    continued detail', [], ['<strong>Scale</strong><br>continued detail'], [/<pre/]],
  ['control: indented multi-space continuation prose', '- Revenue\n    grew 12%.  Margins    expanded.\n    Costs  fell.', [], ['>Revenue<br>grew 12%.  Margins    expanded.<br>Costs  fell.</td>'], [/<pre/]],
  ['control: ordinary multi-space paragraph', 'Revenue grew.  Margins    expanded.\nSecond   line.', [], ['>Revenue grew.  Margins    expanded.<br>Second   line.</p>'], [/<pre/, /<td/]],
  // Headings: an explicit bold numbered title does not depend on what the next block starts with.
  ['numbered bold title, blank line, then year-led prose', '1. **Business Diagnosis**\n\n2024 revenue increased 12%.', ['1. Business Diagnosis'], ['</h2>', '>2024 revenue increased 12%.</p>'], [/<td/]],
  ['numbered bold title then percent-led prose', '2. **Margins**\n45% of revenue is recurring.', ['2. Margins'], ['</h2>', '>45% of revenue is recurring.</p>'], [/<td/]],
  ['numbered bold title at end of input', 'Intro.\n\n5. **Outlook**', ['5. Outlook'], ['>Intro.</p>', '>5. Outlook</h2>'], [/<td/]],
  ['numbered bold title directly before an ATX heading', '1. **Overview**\n## Details\nText.', ['1. Overview', 'Details'], ['>1. Overview</h2>', '>Details</h2>', '>Text.</p>'], [/<td/]],
  ['ATX heading directly before numbered bold title', '## Alpha\n2. **Beta**\nText.', ['Alpha', '2. Beta'], ['>Alpha</h2>', '>2. Beta</h2>', '>Text.</p>'], [/<td/]],
  ['numbered bold title directly before a table', '2. **Ranking**\n| A | B |\n|---|---|\n| 1 | 2 |', ['2. Ranking'], ['</h2>', '>A</th>', '>2</td>'], [/>2\.<\/td>/]],
  ['numbered bold title directly before a quote', '3. **Quote**\n> Moats matter.', ['3. Quote'], ['</h2>', '<blockquote', 'Moats matter.</blockquote>'], [/<td/]],
  ['numbered bold title before a fence that contains title syntax', '4. **Code**\n```\n1. **not a heading**\n<b>x</b>\n```', ['4. Code'], ['>4. Code</h2>', '>1. **not a heading**\n&lt;b&gt;x&lt;/b&gt;</pre>'], [/<td/, /<b>/]],
  // Ordinary list syntax controls.
  ['control: loose plain numbered items', '1. First.\n\n2. Second.', [], ['>1.</td>', '>First.</td>', '>2.</td>', '>Second.</td>'], []],
  ['control: loose bold ordered items with continuation', '1. **Alpha**\n   detail\n\n2. **Beta**', [], ['>1.</td>', '<strong>Alpha</strong><br>detail', '>2.</td>', '<strong>Beta</strong>'], []],
  ['control: bold ordered item, blank line, nested bullet', '1. **Alpha**\n\n   - nested detail', [], ['>1.</td>', '<strong>Alpha</strong>', '>◦</td>', '>nested detail</td>'], []],
  // Fallback: indented runs with connector tokens keep their exact rows; otherwise they are continuation.
  ['ASCII arrow-in-label rows adjacent to a list item', '- Loop\n    A --> B     C\n    D --> E     F', [], ['>Loop</td>', '>    A --&gt; B     C\n    D --&gt; E     F</pre>'], [/Loop<br>/]],
  ['Unicode arrow rows adjacent to a list item', '- Flow\n    Price ↑ → Volume ↑\n    Cost ↓ ← Scale', [], ['>Flow</td>', '>    Price ↑ → Volume ↑\n    Cost ↓ ← Scale</pre>'], [/Flow<br>/]],
  ['ASCII rows after a paragraph line', 'Flywheel:\n    A --> B\n    C --> D', [], ['>Flywheel:</p>', '>    A --&gt; B\n    C --&gt; D</pre>'], [/Flywheel:<br>/]],
  ['ASCII rows with raw HTML stay escaped', '- Map\n    <b>A</b> --> B\n    C --> D', [], ['>Map</td>', '>    &lt;b&gt;A&lt;/b&gt; --&gt; B\n    C --&gt; D</pre>'], [/<b>/]],
  ['ASCII rows split by a blank line keep both parts', '- Loop\n    A --> B\n    C --> D\n\n    E --> F', [], ['>Loop</td>', '>    A --&gt; B\n    C --&gt; D</pre>', '>    E --&gt; F</pre>'], []],
  // Precedence: explicit list, fence and heading syntax end a fallback run.
  ['list child after ASCII rows is not swallowed', '- Loop\n    A --> B\n    C --> D\n  - child', [], ['>Loop</td>', '>    A --&gt; B\n    C --&gt; D</pre>', '>◦</td>', '>child</td>'], [/child<\/pre>/]],
  ['indented fence after ASCII rows is not swallowed', 'Flow:\n\n    A --> B\n    C --> D\n   ```\n   ## not heading\n   ```', [], ['>    A --&gt; B\n    C --&gt; D</pre>', '<pre', '>   ## not heading</pre>'], [/```/]],
  ['ATX heading after ASCII rows is not swallowed', 'Flow:\n\n    A --> B\n    C --> D\n  ## Next', ['Next'], ['>    A --&gt; B\n    C --&gt; D</pre>', '>Next</h2>'], []],
];
for (const [name, text, headings, ordered, absent] of blockCases) test(`block grammar: ${name}`, () => {
  const html = render(text);
  assertInOrder(html, text); assertInert(html);
  assert.equal((html.match(/<h2/g) ?? []).length, headings.length, 'h2 count');
  assert.doesNotMatch(html, /<h3/);
  for (const title of headings) assert.match(html, new RegExp(`<h2[^>]*border-top:10px solid #000[^>]*>${reEscape(title)}</h2>`), title);
  let at = 0;
  for (const part of ordered) { const k = html.indexOf(part, at); assert.ok(k >= 0, `missing or out of order: ${part}`); at = k + part.length; }
  // The shell itself uses layout <td>s, so forbidden patterns are checked against the report body only.
  const report = html.slice(html.indexOf('data-report'), html.lastIndexOf('\n</td></tr>'));
  for (const pattern of absent) assert.doesNotMatch(report, pattern);
});

test('ambiguous indented list continuations keep internal and relative whitespace', () => {
  const cases = [
    ['- Data\n    Name    Value\n    Alpha   1', 'Data<br>Name    Value<br>Alpha   1'],
    ['- Data\n    Name\n      child', 'Data<br>Name<br>  child'],
    ['- Data\n\tName\tValue', 'Data<br>Name\tValue'],
  ];
  for (const [text, content] of cases) {
    const html = render(text);
    assertInOrder(html, text); assertInert(html);
    assert.doesNotMatch(html, /<pre/, text);
    assert.match(html, new RegExp(`<td[^>]*white-space:pre-wrap[^>]*>${reEscape(content)}</td>`), text);
  }
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
