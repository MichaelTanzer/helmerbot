import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const pageSource = readFileSync(new URL('../app/company/[slug]/page.tsx', import.meta.url), 'utf8');
const cardSource = readFileSync(new URL('../components/CompanyCard.tsx', import.meta.url), 'utf8');
const uuid = '12345678-1234-4234-8234-123456789abc';

// Execute the actual TSX offline. Hook slots persist across renders; mount effects
// are flushed so an accidental effect-driven POST fails the no-auto-send test.
function harness({ source = pageSource, slug = 'acme', fetchImpl } = {}) {
  const slots = [];
  const effects = [];
  const requests = [];
  let index = 0;
  let generatedIds = 0;
  const hooks = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!(i in slots) || !deps || deps.some((d, j) => d !== slots[i][j])) effects.push(fn);
      slots[i] = deps;
    },
  };
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const exports = {};

  const context = {
    exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/navigation') return { useParams: () => ({ slug }) };
      if (name === 'next/link') return { default: props => jsx('a', props) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: async (...args) => {
      requests.push(args);
      return fetchImpl ? fetchImpl(...args) : { status: 202, ok: true, json: async () => ({ accepted: true }) };
    },
    crypto: { randomUUID: () => ++generatedIds === 1 ? uuid : '87654321-1234-4234-8234-123456789abc' },
    console,
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return {
    requests,
    get generatedIds() { return generatedIds; },
    render(props) {
      index = 0;
      const tree = (exports.default || exports.CompanyCard)(props);
      while (effects.length) effects.shift()();
      return tree;
    },
  };
}
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [tree];
  return [tree, ...nodes(tree.props?.children)];
}
const text = tree => nodes(tree).filter(n => typeof n === 'string').join(' ');
const button = tree => nodes(tree).find(n => n.type === 'button');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('mount, rerender and fresh refresh never request analysis', async () => {
  for (let mount = 0; mount < 2; mount++) {
    const h = harness();
    const tree = h.render();
    h.render();
    await tick();
    assert.equal(h.requests.length, 0);
    assert.equal(h.generatedIds, 0);
    assert.equal(text(button(tree)), 'Run Analysis');
    assert.equal(button(tree).props.disabled, false);
  }
});

test('explicit click posts only slug and UUID; concurrent and accepted clicks are blocked', async () => {
  let accept;
  const h = harness({ fetchImpl: () => new Promise(resolve => { accept = resolve; }) });
  const initial = h.render();
  assert.ok(button(initial), 'confirmation must have a Run Analysis button');
  const click = button(initial).props.onClick;
  const pending = click();
  click();
  assert.equal(h.requests.length, 1);
  assert.equal(button(h.render()).props.disabled, true);
  const [url, options] = h.requests[0];
  assert.equal(url, '/api/analysis');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { companySlug: 'acme', requestId: uuid });
  accept({ status: 202, ok: true, json: async () => ({ accepted: true, output: 'SECRET REPORT' }) });
  await pending;
  const accepted = h.render();
  assert.equal(button(accepted).props.disabled, true);
  assert.match(text(accepted), /accepted/i);
  assert.match(text(accepted), /close (this |the )?tab/i);
  assert.doesNotMatch(text(accepted), /SECRET REPORT|email sent|delivered/i);
  await click();
  assert.equal(h.requests.length, 1);
});

for (const failure of ['network', 'json', 'non202', 'notAccepted', 'server']) {
  test(`${failure} failure is visible and retry reuses UUID`, async () => {
    let attempts = 0;
    const h = harness({ fetchImpl: async () => {
      if (++attempts > 1) return { status: 202, ok: true, json: async () => ({ accepted: true }) };
      if (failure === 'network') throw new Error('Offline');
      return {
        status: failure === 'non202' ? 200 : failure === 'server' ? 503 : 202,
        ok: failure !== 'server',
        json: async () => {
          if (failure === 'json') throw new Error('Invalid JSON');
          return failure === 'server' ? { error: 'Scheduling unavailable' } : { accepted: failure !== 'notAccepted' };
        },
      };
    } });
    assert.ok(button(h.render()), 'confirmation must have a Run Analysis button');
    await button(h.render()).props.onClick();
    const failed = h.render();
    assert.ok(nodes(failed).find(n => n.props?.role === 'alert'), 'visible error');
    assert.equal(button(failed).props.disabled, false);
    await button(failed).props.onClick();
    assert.equal(h.requests.length, 2);
    assert.equal(JSON.parse(h.requests[0][1].body).requestId, JSON.parse(h.requests[1][1].body).requestId);
    assert.equal(h.generatedIds, 1);
    assert.equal(button(h.render()).props.disabled, true);
  });
}

test('confirmation explains destination, acceptance timing and bounded background work', () => {
  const content = text(harness().render());
  assert.match(content, /full (analysis|result)/i);
  assert.match(content, /sign-in email/i);
  assert.match(content, /wait.*accept/i);
  assert.match(content, /background.*limited/i);
  assert.match(content, /no email.*retry later/i);
  assert.match(content, /not guaranteed/i);
  assert.doesNotMatch(pageSource, /useEffect|data\.output|type=["']email/);
});

test('company card is an Email analysis link, not a send action', () => {
  const tree = harness({ source: cardSource }).render({ c: { slug: 'acme', name: 'Acme', industry: 'Widgets', businessModels: [], powers: [], ticker: null } });
  const link = nodes(tree).find(n => n.type === 'a');
  assert.equal(link.props.href, '/company/acme');
  assert.equal(text(link), 'Email analysis →');
  assert.equal(link.props.onClick, undefined);
});
