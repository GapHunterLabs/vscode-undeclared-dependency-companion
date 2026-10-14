/**
 * Pure logic -- no `vscode` dependency. Flags a package that is imported
 * in JS/TS source but not declared in the project's package.json (under
 * dependencies, devDependencies, peerDependencies, or
 * optionalDependencies). An undeclared import is a common slopsquatting /
 * supply-chain risk: a package name that was never vetted and may not be
 * a real, intended package. 100% local, no network -- this never checks a
 * registry; it only compares what the code imports against what the
 * manifest declares.
 *
 * Scope stated honestly (v1, JS/TS only): a plain-text specifier scanner,
 * not a full AST. It covers the common import shapes (`import ... from`,
 * bare `import`, `export ... from`, `require(...)`, dynamic `import(...)`).
 * Node built-ins and the `node:` prefix are ignored; relative paths
 * (`./`, `../`, `/`) are ignored; path aliases from tsconfig `paths`
 * (passed in by the caller) are ignored to avoid false positives. It does
 * NOT confirm a declared package actually exists on npm (that would need
 * the network); it only catches the undeclared case. A specifier inside a
 * comment or string literal can produce a rare false positive.
 */

export interface UndeclaredViolation {
  packageName: string;
  line: number; // 1-based
  message: string;
}

// Node.js built-in modules: importable without being in package.json.
// The `node:` prefix is always a built-in and is handled separately.
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
  'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads',
  'zlib',
]);

/** The specifier of each import/require found, with the 1-based line of
 * the matched statement. Scans the whole source so multi-line import
 * statements are handled (the line reported is where the specifier sits). */
export function extractImportSpecifiers(source: string): { spec: string; line: number }[] {
  const results: { spec: string; line: number }[] = [];
  const patterns = [
    /(?:^|[^.\w])(?:import|export)\b[^'"`]*?\bfrom\s*['"]([^'"]+)['"]/g, // import/export ... from '...'
    /(?:^|[^.\w])import\s*['"]([^'"]+)['"]/g, // bare import '...'
    /(?:^|[^.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('...')
    /(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('...')
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const spec = m[1];
      // Line of the specifier: count newlines up to where the quoted
      // specifier starts within the match.
      const specIndex = m.index + m[0].lastIndexOf(spec);
      const line = source.slice(0, specIndex).split('\n').length;
      results.push({ spec, line });
    }
  }
  return results;
}

/** The npm package name a specifier resolves to, or null when the
 * specifier is relative/absolute-path (not a package). Scoped packages
 * keep two segments (`@scope/name`); subpaths are stripped
 * (`pkg/sub` -> `pkg`, `@scope/name/sub` -> `@scope/name`). */
export function packageNameFromSpecifier(spec: string): string | null {
  if (spec === '' || spec.startsWith('.') || spec.startsWith('/')) return null;
  const withoutProtocol = spec.startsWith('node:') ? spec.slice('node:'.length) : spec;
  const parts = withoutProtocol.split('/');
  if (spec.startsWith('@')) {
    if (parts.length < 2 || parts[0] === '@' || parts[1] === '') return null; // e.g. "@/alias"
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

export function isBuiltin(spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  const pkg = packageNameFromSpecifier(spec);
  return pkg !== null && NODE_BUILTINS.has(pkg);
}

/** Whether the specifier matches a tsconfig/bundler path alias prefix
 * (e.g. "@/..." or "@app/..."), which resolves to local source, not a
 * package. `aliasPrefixes` come from tsconfig `compilerOptions.paths`
 * keys, with a trailing `/*` or `*` stripped. */
export function isAliasSpecifier(spec: string, aliasPrefixes: string[]): boolean {
  for (const prefix of aliasPrefixes) {
    if (prefix === '') continue;
    if (spec === prefix || spec.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) {
      return true;
    }
    if (spec === prefix) return true;
  }
  return false;
}

export function findUndeclaredDependencies(
  source: string,
  declared: Set<string>,
  aliasPrefixes: string[] = [],
): UndeclaredViolation[] {
  const violations: UndeclaredViolation[] = [];
  const reported = new Set<string>(); // one report per (package,line)
  for (const { spec, line } of extractImportSpecifiers(source)) {
    if (spec.startsWith('.') || spec.startsWith('/')) continue; // relative/absolute path
    if (isBuiltin(spec)) continue;
    if (isAliasSpecifier(spec, aliasPrefixes)) continue;
    const pkg = packageNameFromSpecifier(spec);
    if (pkg === null) continue;
    if (declared.has(pkg)) continue;
    const key = `${pkg}@${line}`;
    if (reported.has(key)) continue;
    reported.add(key);
    violations.push({
      packageName: pkg,
      line,
      message:
        `Package "${pkg}" is imported but not declared in package.json ` +
        `(dependencies, devDependencies, peerDependencies, or optionalDependencies). ` +
        `An undeclared import is a common slopsquatting / supply-chain risk — confirm ` +
        `the package name is real and intended, and add it to the manifest before installing.`,
    });
  }
  return violations;
}

/** Collects every declared dependency name from a parsed package.json. */
export function declaredDependencies(packageJson: unknown): Set<string> {
  const result = new Set<string>();
  if (packageJson === null || typeof packageJson !== 'object') return result;
  const obj = packageJson as Record<string, unknown>;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const section = obj[field];
    if (section !== null && typeof section === 'object') {
      for (const name of Object.keys(section as Record<string, unknown>)) {
        result.add(name);
      }
    }
  }
  return result;
}

/** Extracts alias prefixes from a parsed tsconfig's compilerOptions.paths
 * (the keys, with a trailing `/*` or `*` removed). */
export function aliasPrefixesFromTsconfig(tsconfig: unknown): string[] {
  const prefixes: string[] = [];
  if (tsconfig === null || typeof tsconfig !== 'object') return prefixes;
  const compilerOptions = (tsconfig as Record<string, unknown>)['compilerOptions'];
  if (compilerOptions === null || typeof compilerOptions !== 'object') return prefixes;
  const paths = (compilerOptions as Record<string, unknown>)['paths'];
  if (paths === null || typeof paths !== 'object') return prefixes;
  for (const key of Object.keys(paths as Record<string, unknown>)) {
    const cleaned = key.replace(/\/?\*+$/, '');
    if (cleaned !== '') prefixes.push(cleaned);
  }
  return prefixes;
}
