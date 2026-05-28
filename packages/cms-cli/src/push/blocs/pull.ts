import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { categoryToFolder } from "src/cli/push/shared/categoryFolder";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullBlocsResult = {
    pulled:  string[];
    skipped: { tag: string; reason: string }[];
    failed:  { tag: string; error:  string }[];
};

type RemoteBlocSummary = { tag: string; group: string };

/**
 * Download every bloc that has a `source` bundle on the remote and write
 * its files under `<siteDir>/blocs/<group>/<tag>/`. Blocs uploaded before
 * the source-bundle feature have no bundle — we report them under
 * `skipped` so the user knows to push them once with the new CLI to make
 * them pull-able. The `default-group` legacy field is stripped from
 * `manifest.json` on write, since the group is now carried by the
 * folder layout.
 */
export async function pullBlocs(adminBase: URL, token: string, siteDir: string): Promise<PullBlocsResult> {
    const out: PullBlocsResult = { pulled: [], skipped: [], failed: [] };
    const list = await fetchRemoteBlocList(adminBase, token);

    for (const { tag, group } of list) {
        try {
            const source = await fetchSource(adminBase, token, tag);
            if (source === null) {
                out.skipped.push({ tag, reason: "no source bundle on the server (push it once with the new CLI)" });
                continue;
            }
            const target = join(siteDir, "blocs", categoryToFolder(group), tag);
            await writeBlocSource(target, source);
            out.pulled.push(tag);
        } catch (err) {
            out.failed.push({ tag, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchRemoteBlocList(adminBase: URL, token: string): Promise<RemoteBlocSummary[]> {
    const url = new URL("api/bloc/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json() as { id: string; group?: string }[];
    return data.map(b => ({ tag: b.id, group: b.group ?? "" }));
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
        const bytes = rel === "manifest.json"
            ? Buffer.from(stripLegacyManifestFields(Buffer.from(base64, "base64").toString("utf-8")), "utf-8")
            : Buffer.from(base64, "base64");
        await writeFile(full, bytes);
    }
}

/**
 * Strip `default-group` from a server-stored manifest before writing it to
 * disk. Old bundles still carry it; the local scan rejects it on read, so
 * this lets a single `p9r pull` migrate every existing site cleanly.
 */
function stripLegacyManifestFields(raw: string): string {
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(raw); }
    catch { return raw; }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return raw;
    if (!("default-group" in manifest)) return raw;
    delete manifest["default-group"];
    return JSON.stringify(manifest, null, 4) + "\n";
}
