# Undeclared Dependency Companion (VS Code)

Flags a package that your JS/TS code **imports** but that is **not
declared** in `package.json` — a common slopsquatting / supply-chain
risk, because an unclaimed package name can be registered by an attacker
and installed by mistake. No data leaves your editor.

**v0.1, new niche.** Not a port from the Gap Hunter Labs IntelliJ-family
catalog, and deliberately distinct from `typosquat-dependency-companion`:
typosquatting only covers names that are near-misses of a real package,
but most dangerous undeclared names are *not* edit-distance typos of
anything — a name that was never vetted and never added to the manifest
slips right past a typosquat check. This extension catches that case: the
import exists in the code, the package does not exist in the manifest.

## What it does

Live, on any JavaScript/TypeScript file inside an npm project: scans
`import`, bare `import`, `export … from`, `require(…)` and dynamic
`import(…)` specifiers, and warns when the imported package is not listed
under `dependencies`, `devDependencies`, `peerDependencies` or
`optionalDependencies` of the nearest `package.json`.

Ignored, to keep the signal clean: relative/absolute paths (`./`, `../`,
`/`), Node built-ins and the `node:` prefix, and path aliases read from
your `tsconfig.json` `compilerOptions.paths`.

**v0.1 scope, honestly noted:** a plain-text specifier scanner, not a
full AST — a specifier inside a comment or string literal is a rare
possible false positive. It makes **zero network calls**, so it never
checks whether a *declared* package actually exists on the npm registry;
it only catches the **undeclared** case (the import that was never added
to the manifest). If there is no `package.json` in scope, nothing is
reported. Python (`requirements.txt` / `pyproject.toml`) is planned for a
follow-up once the import→package-name mapping is handled cleanly.

## Privacy

See [PRIVACY.md](PRIVACY.md) — zero network calls, everything runs
against files already open in your editor and the project's own
`package.json`/`tsconfig.json`.

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test
```

To build an installable package without publishing:

```bash
npx @vscode/vsce package
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
