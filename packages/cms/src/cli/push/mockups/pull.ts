import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TDataMockup } from "src/socle/interfaces/Data/data";
import { MOCKUP_FOLDER, mockupFile } from "../shared/mockupsLayout";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullMockupsResult = {
    pulled: number;
    failed: { providerId: string; error: string }[];
};

/**
 * Fetch every remote mockup (per registered provider) and write
 * `<siteDir>/mockups/<providerId>/<path-segments>/<METHOD>/<name>.json`.
 * Each provider folder is wiped first so deletes on the remote are
 * reflected locally — `pull` is the canonical "rebuild from remote".
 */
export async function pullMockups(adminBase: URL, token: string, siteDir: string): Promise<PullMockupsResult> {
    const out: PullMockupsResult = { pulled: 0, failed: [] };
    const root = join(siteDir, MOCKUP_FOLDER);

    let providers: { id: string }[];
    try { providers = await fetchProviderList(adminBase, token); }
    catch (err) {
        out.failed.push({ providerId: "*", error: err instanceof Error ? err.message : String(err) });
        return out;
    }

    for (const { id } of providers) {
        try {
            const list = await fetchMockupsList(adminBase, token, id);
            const dir  = join(root, id);
            if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
            for (const m of list) await writeOne(root, m);
            out.pulled += list.length;
        } catch (err) {
            out.failed.push({ providerId: id, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchProviderList(adminBase: URL, token: string): Promise<{ id: string }[]> {
    const url = new URL("api/data/providers", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as { id: string }[];
}

async function fetchMockupsList(adminBase: URL, token: string, providerId: string): Promise<TDataMockup[]> {
    const url = new URL(`api/data/provider/mockup/list?id=${encodeURIComponent(providerId)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as TDataMockup[];
}

async function writeOne(root: string, m: TDataMockup): Promise<void> {
    const file = mockupFile(root, m.providerId, m.method, m.path, m.name);
    await mkdir(dirname(file), { recursive: true });
    const { providerId: _p, updatedAt: _u, ...persistable } = m;
    const json = JSON.stringify(persistable, null, 4) + "\n";
    await writeFile(file, json, "utf-8");
}
