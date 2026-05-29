import { loadPushConfig } from "../shared/config";
import { loadState, saveState, detectConflict } from "../shared/state";
import { confirm } from "../shared/recap";
import { scanPages } from "../pages/scan";
import { fetchRemoteList } from "../pages/apply";
import { canonicalSystemHash, scanSystem, type LocalSystem } from "./scan";
import { fetchRemoteSystem, projectRemote, flatten, postSystem } from "./apply";

export type RunSystemFlags = { force: boolean; yes: boolean; dryRun: boolean };

export async function runSystem(
    adminBase: URL,
    token:     string,
    flags:     RunSystemFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;

    const local = await scanSystem(config.siteDir);
    if (!local) {
        console.log("→ No site/system.json or site/theme.css. Skipping.");
        return 0;
    }

    if (!await checkPageRefs(adminBase, token, config.siteDir, local, force)) return 1;

    const state      = await loadState(config.siteDir);
    const remote     = await fetchRemoteSystem(adminBase, token);
    const remoteHash = canonicalSystemHash(projectRemote(local.payload, remote));

    if (!force && detectConflict(state, "system", remoteHash)) {
        console.error("✖ system: remote drifted from last sync (re-run with --force to override).");
        return 1;
    }
    if (remoteHash === local.hash) {
        console.log("→ system: unchanged.");
        return 0;
    }
    if (flags.dryRun) {
        console.log("→ system: would push (changed).");
        return 0;
    }
    if (!await confirm("Push system?", flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    await postSystem(adminBase, token, flatten(local.payload));

    state.entities["system"] = { hash: local.hash, lastSeenRemote: local.hash };
    state.lastPulled = new Date().toISOString();
    await saveState(config.siteDir, state);

    console.log("→ system: pushed.");
    return 0;
}

async function checkPageRefs(
    adminBase: URL, token: string, siteDir: string, local: LocalSystem, force: boolean,
): Promise<boolean> {
    if (local.pageRefs.length === 0) return true;

    const [remoteList, localPages] = await Promise.all([
        fetchRemoteList(adminBase, token),
        scanPages(siteDir),
    ]);
    const remote = new Set(remoteList.map(p => p.path));
    const known  = new Set(localPages.map(p => p.path));

    let errors = 0;
    for (const ref of local.pageRefs) {
        if (remote.has(ref))      continue;
        if (known.has(ref))       { console.warn(`⚠ system references page "${ref}" — present locally but not yet on remote.`); continue; }
        console.error(`✖ system references page "${ref}" — missing on remote and locally.`);
        errors++;
    }
    if (errors > 0 && !force) {
        console.error(`\n✖ ${errors} page reference error(s). Re-run with --force to bypass.`);
        return false;
    }
    return true;
}
