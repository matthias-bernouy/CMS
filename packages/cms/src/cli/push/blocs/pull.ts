import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullBlocsResult = {
    pulled:  string[];
    skipped: { tag: string; reason: string }[];
    failed:  { tag: string; error:  string }[];
};

/**
 * Download every bloc that has a `source` bundle on the remote and write
 * its files under `<siteDir>/blocs/<tag>/`. Blocs uploaded before PR 5
 * have no bundle — we report them under `skipped` so the user knows to
 * push them once with the new CLI to make them pull-able.
 */
export async function pullBlocs(adminBase: URL, token: string, siteDir: string): Promise<PullBlocsResult> {
    const out: PullBlocsResult = { pulled: [], skipped: [], failed: [] };
    const list = await fetchRemoteBlocList(adminBase, token);

    for (const tag of list) {
        try {
            const source = await fetchSource(adminBase, token, tag);
            if (source === null) {
                out.skipped.push({ tag, reason: "no source bundle on the server (push it once with the new CLI)" });
                continue;
            }
            await writeBlocSource(join(siteDir, "blocs", tag), source);
            out.pulled.push(tag);
        } catch (err) {
            out.failed.push({ tag, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchRemoteBlocList(adminBase: URL, token: string): Promise<string[]> {
    const url = new URL("api/bloc/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json() as { id: string }[];
    return data.map(b => b.id);
}

async function fetchSource(adminBase: URL, token: string, tag: string): Promise<Record<string, string> | null> {
    const url = new URL(`api/bloc/source?tag=${encodeURIComponent(tag)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json() as { source?: Record<string, string> };
    return data.source ?? null;
}

async function writeBlocSource(target: string, source: Record<string, string>): Promise<void> {
    for (const [rel, base64] of Object.entries(source)) {
        const full = join(target, rel);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, Buffer.from(base64, "base64"));
    }
}
