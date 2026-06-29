import { loadPushConfig } from "../shared/config";
import { loadState, saveState } from "../shared/state";
import { confirm, renderRecap } from "../shared/recap";
import { scanIntegrations } from "./scan";
import { classifyIntegrations } from "./classify";
import { applyPushIntegrations, fetchRemoteIntegrationList } from "./apply";

export type RunIntegrationsFlags = { force: boolean; yes: boolean; dryRun: boolean };

export async function runIntegrations(
    adminBase: URL,
    token:     string,
    flags:     RunIntegrationsFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;

    const local = await scanIntegrations(config.siteDir);
    if (local.length === 0) {
        console.log("→ No integrations found under <siteDir>/integrations/. Skipping.");
        return 0;
    }

    const state      = await loadState(config.siteDir);
    const remote     = await fetchRemoteIntegrationList(adminBase, token);
    const remoteIds  = new Set(remote.map(r => r.id));
    const entries    = classifyIntegrations(local, remoteIds, state, force);

    renderRecap(entries.map(e => ({ path: e.integration.id, status: e.status })), "integration");

    const writes = entries.filter(e => e.status === "new" || e.status === "update");
    if (writes.length === 0) { console.log("\n→ No integration changes."); return 0; }
    if (flags.dryRun)        { console.log(`\n→ Dry-run — would push ${writes.length} integration(s).`); return 0; }

    if (!await confirm(`\nPush ${writes.length} integration(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    const result = await applyPushIntegrations(adminBase, token, entries);
    for (const { id, error } of result.failed) console.error(`    ✗ ${id}: ${error}`);
    for (const { id }        of result.pushed) console.log  (`    ✓ ${id}`);

    for (const ok of result.pushed) {
        state.entities[`integration:${ok.id}`] = { hash: ok.localHash, lastSeenRemote: ok.localHash };
    }
    state.lastPulled = new Date().toISOString();
    await saveState(config.siteDir, state);

    console.log(`\n→ Done. ${result.pushed.length} pushed, ${result.failed.length} failed.`);
    return result.failed.length > 0 ? 1 : 0;
}
