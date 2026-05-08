import { loadPushConfig } from "../shared/config";
import { confirm } from "../shared/recap";
import { scanDataProviders } from "./scan";
import { fetchRemoteList, postProvider, putProvider } from "./apply";

export type RunDataProvidersFlags = { force: boolean; yes: boolean; dryRun: boolean };

/**
 * Push every local data provider to the remote CMS. New ids are POSTed,
 * existing ones are PUT (upsert semantics from the user's point of view).
 * No state tracking yet — the push is best-effort, idempotent on the
 * remote, and skips nothing on its own.
 */
export async function runDataProviders(
    adminBase: URL,
    token:     string,
    flags:     RunDataProvidersFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const local  = await scanDataProviders(config.siteDir);
    if (local.length === 0) {
        console.log("→ No data providers found under <siteDir>/data-providers/. Skipping.");
        return 0;
    }

    const remoteIds = new Set((await fetchRemoteList(adminBase, token)).map(p => p.id));

    const news    = local.filter(p => !remoteIds.has(p.id));
    const updates = local.filter(p =>  remoteIds.has(p.id));

    console.log(`→ Local : ${local.length} provider(s) — ${news.length} new, ${updates.length} update.`);
    if (flags.dryRun) {
        for (const p of news)    console.log(`    + ${p.id}`);
        for (const p of updates) console.log(`    ~ ${p.id}`);
        return 0;
    }
    if (!await confirm(`Push ${local.length} provider(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    let failures = 0;
    for (const p of news) {
        try { await postProvider(adminBase, token, p); console.log(`    ✓ ${p.id} (created)`); }
        catch (e) { failures++; console.error(`    ✗ ${p.id}: ${msg(e)}`); }
    }
    for (const p of updates) {
        try { await putProvider(adminBase, token, p); console.log(`    ✓ ${p.id} (updated)`); }
        catch (e) { failures++; console.error(`    ✗ ${p.id}: ${msg(e)}`); }
    }

    console.log(`→ data: ${local.length - failures} pushed, ${failures} failed.`);
    return failures > 0 ? 1 : 0;
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
