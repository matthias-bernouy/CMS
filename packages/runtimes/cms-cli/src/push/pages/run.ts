import { loadPushConfig } from "../shared/config";
import { loadState, saveState } from "../shared/state";
import { confirm, renderRecap } from "../shared/recap";
import { scanPages } from "./scan";
import { classifyPages, fetchRemotePageHash } from "./classify";
import { applyPushPages, fetchRemoteList } from "./apply";
import { gatherAvailability } from "../shared/availability";
import { validateDocs, printValidation } from "../shared/validate";

export type RunPagesFlags = { force: boolean; yes: boolean; dryRun: boolean };

/**
 * Push the contents of `<siteDir>/pages/`. Returns the exit code so the
 * dispatcher can chain other types or propagate the status.
 */
export async function runPages(
    adminBase: URL,
    token:     string,
    flags:     RunPagesFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;

    console.log(`→ Site dir : ${config.siteDir}`);
    if (flags.dryRun) console.log(`→ Mode     : dry-run (no upload)`);
    if (force)        console.log(`→ Force    : conflicts and validation errors will be bypassed`);

    const local = await scanPages(config.siteDir);
    if (local.length === 0) {
        console.log("→ No pages found under <siteDir>/pages/. Nothing to push.");
        return 0;
    }

    const avail  = await gatherAvailability(adminBase, token, config.siteDir);
    const report = validateDocs(
        local.map(p => ({ source: p.path, content: p.content })),
        avail.remoteBlocs, avail.localBlocs,
    );
    if (!printValidation(report, force)) return 1;

    const state  = await loadState(config.siteDir);
    const remote = await fetchRemoteList(adminBase, token);
    const entries = await classifyPages(
        local, remote, state,
        id => fetchRemotePageHash(adminBase, token, id),
        force,
    );

    renderRecap(entries.map(e => ({ path: e.page.path, status: e.status })), "page");

    const writes = entries.filter(e => e.status === "new" || e.status === "update");
    if (writes.length === 0) { console.log("\n→ Nothing to push."); return 0; }
    if (flags.dryRun)        { console.log(`\n→ Dry-run — would push ${writes.length} page(s).`); return 0; }

    if (!await confirm(`\nPush ${writes.length} page(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    const result = await applyPushPages(adminBase, token, entries);
    for (const { path, error } of result.failed) console.error(`    ✗ ${path}: ${error}`);
    for (const { path }        of result.pushed) console.log  (`    ✓ ${path}`);

    for (const ok of result.pushed) {
        state.entities[`page:${ok.path}`] = { hash: ok.localHash, lastSeenRemote: ok.localHash };
    }
    state.lastPulled = new Date().toISOString();
    await saveState(config.siteDir, state);

    console.log(`\n→ Done. ${result.pushed.length} pushed, ${result.failed.length} failed.`);
    return result.failed.length > 0 ? 1 : 0;
}
