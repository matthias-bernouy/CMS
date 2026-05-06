import { loadPushConfig } from "../shared/config";
import { loadState, saveState } from "../shared/state";
import { confirm, renderRecap } from "../shared/recap";
import { gatherAvailability } from "../shared/availability";
import { validateDocs, printValidation } from "../shared/validate";
import { scanSnippets } from "./scan";
import { classifySnippets, fetchRemoteSnippetHash } from "./classify";
import { applyPushSnippets, fetchRemoteSnippetList } from "./apply";

export type RunSnippetsFlags = { force: boolean; yes: boolean; dryRun: boolean };

export async function runSnippets(
    adminBase: URL,
    token:     string,
    flags:     RunSnippetsFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;

    const local = await scanSnippets(config.siteDir);
    if (local.length === 0) {
        console.log("→ No snippets found under <siteDir>/snippets/. Skipping.");
        return 0;
    }

    const avail  = await gatherAvailability(adminBase, token, config.siteDir);
    const report = validateDocs(
        local.map(s => ({ source: `snippet:${s.identifier}`, content: s.content })),
        avail.remoteBlocs, avail.localBlocs, avail.remoteSnips, avail.localSnips,
    );
    if (!printValidation(report, force)) return 1;

    const state  = await loadState(config.siteDir);
    const remote = await fetchRemoteSnippetList(adminBase, token);
    const entries = await classifySnippets(
        local, remote, state,
        identifier => fetchRemoteSnippetHash(adminBase, token, identifier),
        force,
    );

    renderRecap(entries.map(e => ({ path: e.snippet.identifier, status: e.status })), "snippet");

    const writes = entries.filter(e => e.status === "new" || e.status === "update");
    if (writes.length === 0) { console.log("\n→ No snippet changes."); return 0; }
    if (flags.dryRun)        { console.log(`\n→ Dry-run — would push ${writes.length} snippet(s).`); return 0; }

    if (!await confirm(`\nPush ${writes.length} snippet(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    const result = await applyPushSnippets(adminBase, token, entries);
    for (const { identifier, error } of result.failed) console.error(`    ✗ ${identifier}: ${error}`);
    for (const { identifier }        of result.pushed) console.log  (`    ✓ ${identifier}`);

    for (const ok of result.pushed) {
        state.entities[`snippet:${ok.identifier}`] = { hash: ok.localHash, lastSeenRemote: ok.localHash };
    }
    state.lastPulled = new Date().toISOString();
    await saveState(config.siteDir, state);

    console.log(`\n→ Done. ${result.pushed.length} pushed, ${result.failed.length} failed.`);
    return result.failed.length > 0 ? 1 : 0;
}
