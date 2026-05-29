import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { scanDevBlocs } from "cms-cli/dev-server/scan";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export async function fetchRemoteBlocs(adminBase: URL, token: string): Promise<Set<string>> {
    const url = new URL("api/bloc/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json() as { id: string }[];
    if (!Array.isArray(data)) throw new Error(`GET ${url} did not return an array`);
    return new Set(data.map(b => b.id));
}

export async function fetchRemoteSnippets(adminBase: URL, token: string): Promise<Set<string>> {
    const url = new URL("api/snippet/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json() as { identifier: string }[];
    if (!Array.isArray(data)) throw new Error(`GET ${url} did not return an array`);
    return new Set(data.map(s => s.identifier));
}

/** Bloc tags pending a future `p9r import`. Empty when site/blocs/ doesn't exist. */
export async function scanLocalBlocs(siteDir: string): Promise<Set<string>> {
    const root = join(siteDir, "blocs");
    if (!existsSync(root)) return new Set();
    const blocs = await scanDevBlocs(root, { quiet: true });
    return new Set(blocs.map(b => b.tag));
}

/** Snippet identifiers pending a future PR-2 push. Filename without extension. */
export async function scanLocalSnippets(siteDir: string): Promise<Set<string>> {
    const root = join(siteDir, "snippets");
    if (!existsSync(root)) return new Set();
    const out = new Set<string>();
    const folders = await readdir(root, { withFileTypes: true });
    for (const f of folders) {
        if (!f.isDirectory()) continue;
        const files = await readdir(join(root, f.name));
        for (const file of files) {
            if (!file.endsWith(".html") || file.startsWith(".")) continue;
            out.add(file.slice(0, -".html".length));
        }
    }
    return out;
}

export type Availability = {
    remoteBlocs: Set<string>; localBlocs: Set<string>;
    remoteSnips: Set<string>; localSnips: Set<string>;
};

/** Single-shot fetch+scan of every set the validator needs. */
export async function gatherAvailability(
    adminBase: URL, token: string, siteDir: string,
): Promise<Availability> {
    const [remoteBlocs, remoteSnips, localBlocs, localSnips] = await Promise.all([
        fetchRemoteBlocs   (adminBase, token),
        fetchRemoteSnippets(adminBase, token),
        scanLocalBlocs     (siteDir),
        scanLocalSnippets  (siteDir),
    ]);
    return { remoteBlocs, localBlocs, remoteSnips, localSnips };
}
