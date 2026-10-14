import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findUndeclaredDependencies,
  declaredDependencies,
  aliasPrefixesFromTsconfig,
} from '../dependency';

/**
 * Smoke test: runs the full chain end to end over the real demo/ fixture
 * on disk (read package.json + tsconfig.json, parse, scan the source),
 * the same chain the extension runs at runtime minus the vscode event
 * wiring. Deterministic and headless -- no editor, no network.
 */
test('smoke: end-to-end over the demo/ fixture', () => {
  const root = join(__dirname, '..', '..', 'demo');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
  const source = readFileSync(join(root, 'src', 'sample.ts'), 'utf8');

  const declared = declaredDependencies(pkg);
  const aliases = aliasPrefixesFromTsconfig(tsconfig);
  const violations = findUndeclaredDependencies(source, declared, aliases);

  const names = violations.map((v) => v.packageName).sort();
  assert.deepEqual(names, ['another-ghost', 'totally-made-up-pkg']);
});
