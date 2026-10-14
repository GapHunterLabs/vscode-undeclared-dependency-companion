import * as vscode from 'vscode';
import {
  findUndeclaredDependencies,
  declaredDependencies,
  aliasPrefixesFromTsconfig,
} from './dependency';
import { recordHit } from './reviewPrompt';

let diagnostics: vscode.DiagnosticCollection;

const JS_TS_LANGS = new Set(['javascript', 'javascriptreact', 'typescript', 'typescriptreact']);

/** Strips `//` and block comments and trailing commas so JSONC files
 * (tsconfig.json often is one) parse with JSON.parse. Minimal on purpose;
 * aliases only reduce false positives, so an imperfect parse degrades to
 * "no aliases", never to a wrong result. */
function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

async function readNearestJson(fromDir: vscode.Uri, filename: string): Promise<unknown | null> {
  let dir = fromDir;
  for (let i = 0; i < 20; i++) {
    const candidate = vscode.Uri.joinPath(dir, filename);
    try {
      const bytes = await vscode.workspace.fs.readFile(candidate);
      const text = Buffer.from(bytes).toString('utf8');
      return JSON.parse(stripJsonComments(text));
    } catch {
      // not in this directory (or unreadable/unparseable) -- walk up
    }
    const parent = vscode.Uri.joinPath(dir, '..');
    if (parent.path === dir.path) break;
    dir = parent;
  }
  return null;
}

async function refresh(context: vscode.ExtensionContext, document: vscode.TextDocument): Promise<void> {
  if (!JS_TS_LANGS.has(document.languageId)) {
    diagnostics.delete(document.uri);
    return;
  }
  if (document.uri.scheme !== 'file') {
    diagnostics.delete(document.uri);
    return;
  }

  const dir = vscode.Uri.joinPath(document.uri, '..');
  const packageJson = await readNearestJson(dir, 'package.json');
  if (packageJson === null) {
    // No manifest in scope -- not an npm project, nothing to compare against.
    diagnostics.delete(document.uri);
    return;
  }
  const declared = declaredDependencies(packageJson);
  const tsconfig = await readNearestJson(dir, 'tsconfig.json');
  const aliasPrefixes = aliasPrefixesFromTsconfig(tsconfig);

  const violations = findUndeclaredDependencies(document.getText(), declared, aliasPrefixes);
  const result = violations.map((violation) => {
    const line = violation.line - 1;
    const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
    const diagnostic = new vscode.Diagnostic(range, violation.message, vscode.DiagnosticSeverity.Warning);
    diagnostic.source = 'Undeclared Dependency Companion';
    diagnostic.code = 'UNDECLARED_DEPENDENCY';
    recordHit(context, `${document.uri.toString()}:${violation.packageName}`);
    return diagnostic;
  });
  diagnostics.set(document.uri, result);
}

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('undeclaredDependencyCompanion');
  context.subscriptions.push(diagnostics);

  vscode.workspace.textDocuments.forEach((doc) => void refresh(context, doc));

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => void refresh(context, doc)),
    vscode.workspace.onDidSaveTextDocument((doc) => void refresh(context, doc)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
  );
}

export function deactivate(): void {
  diagnostics?.dispose();
}
