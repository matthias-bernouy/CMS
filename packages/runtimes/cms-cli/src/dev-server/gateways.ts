import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Provider } from "@bernouy/cms-gateway";

/**
 * Load gateway provider manifests from `siteDir/gateways/*.json` — one Provider
 * per file (`urn`, `meta`, `endpoints[]`). Mirrors how blocs are scanned from
 * `siteDir/blocs`: the folder IS the source of truth for dev.
 *
 * Only JSON shape is checked here (parse + skip-on-error); provider validation
 * and urn-uniqueness happen in `seedProviders` so a malformed manifest fails
 * loudly at seed time rather than silently dropping a provider.
 */
export async function loadDevGateways(siteDir: string): Promise<Provider[]> {
    const dir = join(siteDir, "gateways");
    if (!existsSync(dir)) return [];

    let entries: string[];
    try { entries = await readdir(dir); }
    catch { return []; }

    const providers: Provider[] = [];
    for (const entry of entries.sort()) {
        if (!entry.endsWith(".json")) continue;
        try {
            providers.push(JSON.parse(await readFile(join(dir, entry), "utf-8")) as Provider);
        } catch (e) {
            console.warn(`[gateways] skipped ${entry}: ${e instanceof Error ? e.message : e}`);
        }
    }
    return providers;
}
