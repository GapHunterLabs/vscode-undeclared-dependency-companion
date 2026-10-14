import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findUndeclaredDependencies,
  packageNameFromSpecifier,
  extractImportSpecifiers,
  declaredDependencies,
  aliasPrefixesFromTsconfig,
} from '../dependency';

const declared = (...names: string[]): Set<string> => new Set(names);

test('flags a package imported but not declared', () => {
  const v = findUndeclaredDependencies(`import foo from 'left-pad-helper';`, declared('react'));
  assert.equal(v.length, 1);
  assert.equal(v[0].packageName, 'left-pad-helper');
  assert.equal(v[0].line, 1);
});

test('does not flag a declared package', () => {
  const v = findUndeclaredDependencies(`import React from 'react';`, declared('react'));
  assert.equal(v.length, 0);
});

test('ignores relative and absolute imports', () => {
  const src = `import a from './util';\nimport b from '../lib/x';\nimport c from '/abs/path';`;
  assert.equal(findUndeclaredDependencies(src, declared()).length, 0);
});

test('ignores Node built-ins and the node: prefix', () => {
  const src = `import fs from 'fs';\nimport path from 'path';\nimport { readFile } from 'node:fs/promises';`;
  assert.equal(findUndeclaredDependencies(src, declared()).length, 0);
});

test('flags an undeclared scoped package and reports @scope/name', () => {
  const v = findUndeclaredDependencies(`import x from '@acme/widgets';`, declared('react'));
  assert.equal(v.length, 1);
  assert.equal(v[0].packageName, '@acme/widgets');
});

test('does not flag a declared scoped package even when imported via a subpath', () => {
  const v = findUndeclaredDependencies(`import x from '@acme/widgets/button';`, declared('@acme/widgets'));
  assert.equal(v.length, 0);
});

test('resolves a subpath import to its top-level package', () => {
  const v = findUndeclaredDependencies(`import x from 'lodash/debounce';`, declared('react'));
  assert.equal(v.length, 1);
  assert.equal(v[0].packageName, 'lodash');
});

test('detects require()', () => {
  const v = findUndeclaredDependencies(`const z = require('ghost-pkg');`, declared());
  assert.equal(v.length, 1);
  assert.equal(v[0].packageName, 'ghost-pkg');
});

test('detects dynamic import()', () => {
  const v = findUndeclaredDependencies(`const m = await import('phantom-lib');`, declared());
  assert.equal(v.length, 1);
  assert.equal(v[0].packageName, 'phantom-lib');
});

test('detects re-export (export ... from)', () => {
  const v = findUndeclaredDependencies(`export { x } from 'invented-helper';`, declared());
  assert.equal(v.length, 1);
  assert.equal(v[0].packageName, 'invented-helper');
});

test('handles a multi-line import statement and reports the specifier line', () => {
  const src = ['import {', '  a,', '  b,', "} from 'made-up-pkg';"].join('\n');
  const v = findUndeclaredDependencies(src, declared());
  assert.equal(v.length, 1);
  assert.equal(v[0].packageName, 'made-up-pkg');
  assert.equal(v[0].line, 4);
});

test('ignores a tsconfig path alias', () => {
  const src = `import a from '@/components/Button';\nimport b from '@app/store';`;
  const v = findUndeclaredDependencies(src, declared(), ['@', '@app']);
  assert.equal(v.length, 0);
});

test('does not treat a .import member access as an import', () => {
  const v = findUndeclaredDependencies(`obj.import('not-a-real-import');`, declared());
  assert.equal(v.length, 0);
});

test('packageNameFromSpecifier handles the main shapes', () => {
  assert.equal(packageNameFromSpecifier('react'), 'react');
  assert.equal(packageNameFromSpecifier('lodash/fp'), 'lodash');
  assert.equal(packageNameFromSpecifier('@scope/pkg/sub'), '@scope/pkg');
  assert.equal(packageNameFromSpecifier('./rel'), null);
  assert.equal(packageNameFromSpecifier('node:fs'), 'fs');
});

test('declaredDependencies collects all four manifest sections', () => {
  const pkg = {
    dependencies: { react: '^18' },
    devDependencies: { typescript: '^5' },
    peerDependencies: { vue: '^3' },
    optionalDependencies: { fsevents: '^2' },
  };
  const set = declaredDependencies(pkg);
  assert.ok(set.has('react') && set.has('typescript') && set.has('vue') && set.has('fsevents'));
});

test('declaredDependencies is safe on malformed input', () => {
  assert.equal(declaredDependencies(null).size, 0);
  assert.equal(declaredDependencies('nope').size, 0);
  assert.equal(declaredDependencies({ dependencies: 'bad' }).size, 0);
});

test('aliasPrefixesFromTsconfig strips the trailing glob', () => {
  const tsconfig = { compilerOptions: { paths: { '@/*': ['src/*'], '@app/*': ['src/app/*'], 'bare': ['x'] } } };
  const prefixes = aliasPrefixesFromTsconfig(tsconfig);
  assert.deepEqual(prefixes.sort(), ['@', '@app', 'bare']);
});

test('a devDependency counts as declared', () => {
  const v = findUndeclaredDependencies(`import { test } from 'vitest';`, declared('vitest'));
  assert.equal(v.length, 0);
});

test('extractImportSpecifiers finds multiple specifiers', () => {
  const src = `import a from 'x';\nconst b = require('y');`;
  const specs = extractImportSpecifiers(src).map((s) => s.spec).sort();
  assert.deepEqual(specs, ['x', 'y']);
});
