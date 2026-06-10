import { loadPushConfig } from "../shared/config";
import { loadState, saveState } from "../shared/state";
import { confirm, renderRecap } from "../shared/recap";
import { scanGateways } from "./scan";
import { classifyGateways } from "./classify";
import { applyPushGateways, fetchRemoteGatewayList } from "./apply";

export type RunGatewaysFlags = { force: boolean; yes: boolean; dryRun: boolean };

export async function runGateways(
    adminBase: URL,
    token:     string,
    flags:     RunGatewaysFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;

    const local = await scanGateways(config.siteDir);
    if (local.length === 0) {
        console.log("→ No gateways found under <siteDir>/gateways/. Skipping.");
        return 0;
    }

    const state      = await loadState(config.siteDir);
    const remote     = await fetchRemoteGatewayList(adminBase, token);
    const remoteUrns = new Set(remote.map(r => r.urn));
    const entries    = classifyGateways(local, remoteUrns, state, force);

    renderRecap(entries.map(e => ({ path: e.gateway.urn, status: e.status })), "gateway");

    const writes = entries.filter(e => e.status === "new" || e.status === "update");
    if (writes.length === 0) { console.log("\n→ No gateway changes."); return 0; }
    if (flags.dryRun)        { console.log(`\n→ Dry-run — would push ${writes.length} gateway(s).`); return 0; }

    if (!await confirm(`\nPush ${writes.length} gateway(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    const result = await applyPushGateways(adminBase, token, entries);
    for (const { urn, error } of result.failed) console.error(`    ✗ ${urn}: ${error}`);
    for (const { urn }        of result.pushed) console.log  (`    ✓ ${urn}`);

    for (const ok of result.pushed) {
        state.entities[`gateway:${ok.urn}`] = { hash: ok.localHash, lastSeenRemote: ok.localHash };
    }
    state.lastPulled = new Date().toISOString();
    await saveState(config.siteDir, state);

    console.log(`\n→ Done. ${result.pushed.length} pushed, ${result.failed.length} failed.`);
    return result.failed.length > 0 ? 1 : 0;
}
