import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TDataProvider } from "src/socle/interfaces/Data/data";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullDataProvidersResult = {
    pulled: string[];
    failed: { id: string; error: string }[];
};

/**
 * Fetch every remote data provider (full record, including auth secrets in
 * clear) and write `<siteDir>/data-providers/<id>.json`. Auth secrets stay
 * in clear on disk for now — the planned settings ENV VARIABLE tab will
 * later swap them for `${VAR}` references.
 */
export async function pullDataProviders(
    adminBase: URL,
    token:     string,
    siteDir:   string,
): Promise<PullDataProvidersResult> {
    const out: PullDataProvidersResult = { pulled: [], failed: [] };
    const list = await fetchList(adminBase, token);

    for (const { id } of list) {
        try {
            const provider = await fetchOne(adminBase, token, id);
            await writeProvider(siteDir, provider);
            out.pulled.push(id);
        } catch (err) {
            out.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchList(adminBase: URL, token: string): Promise<{ id: string }[]> {
    const url = new URL("api/data/providers", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as { id: string }[];
}

async function fetchOne(adminBase: URL, token: string, id: string): Promise<TDataProvider> {
    const url = new URL(`api/data/provider?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as TDataProvider;
}

async function writeProvider(siteDir: string, p: TDataProvider): Promise<void> {
    const dir = join(siteDir, "data-providers");
    await mkdir(dir, { recursive: true });
    // Drop server-managed timestamps so the file round-trips cleanly.
    const { createdAt: _c, lastSyncAt: _l, ...persistable } = p;
    const json = JSON.stringify(persistable, null, 4) + "\n";
    await writeFile(join(dir, `${p.id}.json`), json, "utf-8");
}
