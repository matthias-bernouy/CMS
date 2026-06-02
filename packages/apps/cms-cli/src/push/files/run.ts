import { loadPushConfig } from "../shared/config";
import { loadState, saveState } from "../shared/state";
import { confirm, renderRecap } from "../shared/recap";
import { scanFiles } from "./scan";
import { classifyFiles } from "./classify";
import { applyPushFiles, fetchRemoteTree } from "./apply";

export type RunFilesFlags = { force: boolean; yes: boolean; dryRun: boolean };

export async function runFiles(
    adminBase: URL,
    token:     string,
    flags:     RunFilesFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;

    const local = await scanFiles(config.siteDir);
    if (local.length === 0) {
        console.log("→ No files found under <siteDir>/files/. Skipping.");
        return 0;
    }

    const state   = await loadState(config.siteDir);
    const tree    = await fetchRemoteTree(adminBase, token);
    const entries = classifyFiles(local, tree.filesByPath, state, force);

    renderRecap(entries.map(e => ({ path: e.file.path, status: e.status })), "file");

    const writes = entries.filter(e => e.status === "new" || e.status === "update");
    if (writes.length === 0) { console.log("\n→ No file changes."); return 0; }
    if (flags.dryRun)        { console.log(`\n→ Dry-run — would push ${writes.length} file(s).`); return 0; }

    if (!await confirm(`\nPush ${writes.length} file(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    const result = await applyPushFiles(adminBase, token, entries, tree);
    for (const { path, error } of result.failed) console.error(`    ✗ ${path}: ${error}`);
    for (const { path }        of result.pushed) console.log  (`    ✓ ${path}`);

    for (const ok of result.pushed) {
        state.entities[`file:${ok.path}`] = { hash: ok.hash, lastSeenRemote: String(ok.size) };
    }
    state.lastPulled = new Date().toISOString();
    await saveState(config.siteDir, state);

    console.log(`\n→ Done. ${result.pushed.length} pushed, ${result.failed.length} failed.`);
    return result.failed.length > 0 ? 1 : 0;
}
