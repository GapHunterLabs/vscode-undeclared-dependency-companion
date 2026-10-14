import * as vscode from 'vscode';

/**
 * Asks the user to rate the extension on the Marketplace, once, after a
 * real number of distinct undeclared-dependency findings -- never on
 * install, never on a timer. Dedup'd by a stable key (file URI + package
 * name) rather than a raw invocation count, so re-scanning the same
 * unchanged finding on every refresh doesn't inflate the count towards the
 * prompt -- mirrors the Kotlin catalog's file:line dedup.
 *
 * Persisted via `ExtensionContext.globalState` (not workspaceState) -- how
 * many times this extension has been used isn't tied to any one workspace,
 * and neither is whether the user already answered.
 *
 * Standard mechanism used catalog-wide since 2026-08-24.
 */

const HITS_BEFORE_PROMPT = 10;
const MAX_TRACKED_KEYS = 200;

const KEY_SEEN_FINDINGS = 'undeclaredDependencyCompanion.review.seenFindings';
const KEY_ANSWERED = 'undeclaredDependencyCompanion.review.answered';

const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/publishers/GapHunterLabs';

export function recordHit(context: vscode.ExtensionContext, findingKey: string): void {
  if (context.globalState.get<boolean>(KEY_ANSWERED, false)) {
    return;
  }

  const seen = context.globalState.get<string[]>(KEY_SEEN_FINDINGS, []);
  if (seen.includes(findingKey)) {
    return;
  }

  const updated = [...seen, findingKey].slice(-MAX_TRACKED_KEYS);
  void context.globalState.update(KEY_SEEN_FINDINGS, updated);

  if (updated.length === HITS_BEFORE_PROMPT) {
    showPrompt(context);
  }
}

function showPrompt(context: vscode.ExtensionContext): void {
  const rateAction = 'Rate on Marketplace';
  const dismissAction = "Don't ask again";

  void vscode.window
    .showInformationMessage(
      `Undeclared Dependency Companion: this has flagged ${HITS_BEFORE_PROMPT} undeclared imports in your code -- if it's saved you time, a rating on the Marketplace helps other developers find it.`,
      rateAction,
      dismissAction,
    )
    .then((selection) => {
      if (selection === rateAction) {
        void context.globalState.update(KEY_ANSWERED, true);
        void vscode.env.openExternal(vscode.Uri.parse(MARKETPLACE_URL));
      } else if (selection === dismissAction) {
        void context.globalState.update(KEY_ANSWERED, true);
      }
      // No selection (dismissed by clicking away): leave unanswered so it
      // can prompt again after the next real hit.
    });
}
