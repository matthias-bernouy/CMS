import { loadPushConfig } from "../shared/config";
import { confirm } from "../shared/recap";
import { scanMockups, type LocalMockup } from "./scan";
import { deleteMockup, fetchRemoteMockups, postMockup, putMockup, setActive, type RemoteMockup } from "./apply";

export type RunMockupsFlags = { force: boolean; yes: boolean; dryRun: boolean };

/**
 * Push mockups from `<siteDir>/mockups/<providerId>/*.json` to the
 * remote CMS, per provider. Sequence: POST new, PUT updates, DELETE
 * removed, then sync the active flag for each (method, path) where
 * the local marks one mockup as active.
 *
 * Mockups for providers that don't exist on the remote are skipped —
 * push providers first (the `data` stage already does this).
 */
export async function runMockups(adminBase: URL, token: string, flags: RunMockupsFlags): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const local  = await scanMockups(config.siteDir);
    if (local.length === 0) {
        console.log("→ No mockups under <siteDir>/mockups/. Skipping.");
        return 0;
    }

    const byProvider = groupByProvider(local);
    const total      = countTotal(byProvider);

    console.log(`→ Local : ${total} mockup(s) across ${byProvider.size} provider(s).`);

    if (flags.dryRun) {
        for (const [pid, mockups] of byProvider) {
            console.log(`    [${pid}] ${mockups.length} mockup(s)`);
            for (const m of mockups) console.log(`      ${m.method} ${m.path} :: ${m.name} (${m.status}${m.active ? " · active" : ""})`);
        }
        return 0;
    }
    if (!await confirm(`Push ${total} mockup(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    let failures = 0;
    for (const [providerId, locals] of byProvider) {
        let remote: RemoteMockup[];
        try { remote = await fetchRemoteMockups(adminBase, token, providerId); }
        catch (e) {
            console.error(`    ✗ [${providerId}] could not list remote mockups: ${msg(e)}`);
            failures += locals.length;
            continue;
        }

        const remoteByKey = new Map(remote.map(m => [keyOf(m), m]));
        const localKeys   = new Set(locals.map(keyOf));

        for (const m of locals) {
            const exists = remoteByKey.has(keyOf(m));
            try {
                if (exists) await putMockup(adminBase, token, m);
                else        await postMockup(adminBase, token, m);
                console.log(`    ✓ [${providerId}] ${m.method} ${m.path} :: ${m.name}`);
            } catch (e) {
                failures++;
                console.error(`    ✗ [${providerId}] ${m.method} ${m.path} :: ${m.name}: ${msg(e)}`);
            }
        }

        for (const r of remote) {
            if (localKeys.has(keyOf(r))) continue;
            try {
                await deleteMockup(adminBase, token, providerId, r.method, r.path, r.name);
                console.log(`    − [${providerId}] removed ${r.method} ${r.path} :: ${r.name}`);
            } catch (e) {
                failures++;
                console.error(`    ✗ [${providerId}] delete ${r.name}: ${msg(e)}`);
            }
        }

        for (const op of distinctOps(locals)) {
            const active = locals.find(m => m.method === op.method && m.path === op.path && m.active);
            try { await setActive(adminBase, token, providerId, op.method, op.path, active?.name ?? null); }
            catch (e) { failures++; console.error(`    ✗ [${providerId}] set active for ${op.method} ${op.path}: ${msg(e)}`); }
        }
    }

    console.log(`→ mockups: ${total - failures} pushed, ${failures} failed.`);
    return failures > 0 ? 1 : 0;
}

function keyOf(m: { method: string; path: string; name: string }): string {
    return `${m.method}|${m.path}|${m.name}`;
}

function groupByProvider(list: LocalMockup[]): Map<string, LocalMockup[]> {
    const out = new Map<string, LocalMockup[]>();
    for (const m of list) {
        const arr = out.get(m.providerId) ?? [];
        arr.push(m);
        out.set(m.providerId, arr);
    }
    return out;
}

function distinctOps(list: LocalMockup[]): { method: string; path: string }[] {
    const seen = new Set<string>();
    const out: { method: string; path: string }[] = [];
    for (const m of list) {
        const k = `${m.method}|${m.path}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ method: m.method, path: m.path });
    }
    return out;
}

function countTotal(map: Map<string, LocalMockup[]>): number {
    let n = 0;
    for (const v of map.values()) n += v.length;
    return n;
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }
