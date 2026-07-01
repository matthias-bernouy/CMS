import { loadPushConfig } from "../shared/config";
import { loadState, saveState } from "../shared/state";
import { confirm, renderRecap } from "../shared/recap";
import { gatherAvailability } from "../shared/availability";
import { validateDocs, printValidation } from "../shared/validate";
import { scanTemplates } from "./scan";
import { classifyTemplates, fetchRemoteTemplateHash } from "./classify";
import { applyPushTemplates, fetchRemoteTemplateList } from "./apply";

export type RunTemplatesFlags = { force: boolean; yes: boolean; dryRun: boolean };

export async function runTemplates(
    adminBase: URL,
    token:     string,
    flags:     RunTemplatesFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;

    const local = await scanTemplates(config.siteDir);
    if (local.length === 0) {
        console.log("→ No templates found under <siteDir>/templates/. Skipping.");
        return 0;
    }

    const avail  = await gatherAvailability(adminBase, token, config.siteDir);
    const report = validateDocs(
        local.map(t => ({ source: `template:${t.identifier}`, content: t.content })),
        avail.remoteBlocs, avail.localBlocs,
    );
    if (!printValidation(report, force)) return 1;

    const state  = await loadState(config.siteDir);
    const remote = await fetchRemoteTemplateList(adminBase, token);
    const entries = await classifyTemplates(
        local, remote, state,
        id => fetchRemoteTemplateHash(adminBase, token, id),
        force,
    );

    renderRecap(entries.map(e => ({ path: e.template.identifier, status: e.status })), "template");

    const writes = entries.filter(e => e.status === "new" || e.status === "update");
    if (writes.length === 0) { console.log("\n→ No template changes."); return 0; }
    if (flags.dryRun)        { console.log(`\n→ Dry-run — would push ${writes.length} template(s).`); return 0; }

    if (!await confirm(`\nPush ${writes.length} template(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    const result = await applyPushTemplates(adminBase, token, entries);
    for (const { identifier, error } of result.failed) console.error(`    ✗ ${identifier}: ${error}`);
    for (const { identifier }        of result.pushed) console.log  (`    ✓ ${identifier}`);

    for (const ok of result.pushed) {
        state.entities[`template:${ok.identifier}`] = { hash: ok.localHash, lastSeenRemote: ok.localHash };
    }
    state.lastPulled = new Date().toISOString();
    await saveState(config.siteDir, state);

    console.log(`\n→ Done. ${result.pushed.length} pushed, ${result.failed.length} failed.`);
    return result.failed.length > 0 ? 1 : 0;
}
