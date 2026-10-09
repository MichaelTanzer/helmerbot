import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'csv-parse/sync';

test('CSV dependency upgrade preserves the complete checked-in dataset', () => {
  const rows = parse(readFileSync(new URL('../data/companies.csv', import.meta.url), 'utf8'), {
    columns: true, skip_empty_lines: true,
  });
  assert.equal(rows.length, 1624);
  // Captured with the previous parser before upgrading, including all fields.
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    '0b691271c6aa1ce242393efcfc11c3ee5475ab2b906a4d0d4891d573c208c3fc');
});

test('CSV columns cannot replace a parsed record prototype', () => {
  const [row] = parse('__proto__,Company Name\nattack,Example\n', {
    columns: true,
    cast: value => value === 'attack' ? { injected: true } : value,
  });
  assert.equal(Object.getPrototypeOf(row), Object.prototype);
  assert.equal(row.injected, undefined);
  assert.equal(row['Company Name'], 'Example');
});
