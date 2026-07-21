import { existsSync } from "node:fs";
import { join } from "node:path";
import { scanDevBlocs } from "cms-cli/dev-server/scan";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export async function fetchRemoteBlocs(adminBase: URL, token: string): Promise<Set<string>> {
    const url = new URL("api/bloc/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    const data = (await res.json()) as { id: string }[];
    if (!Array.isArray(data)) {
        throw new Error(`GET ${url} did not return an array`);
    }
    return new Set(data.map((b) => b.id));
}

/** Locally available bloc tags. Empty when site/blocs/ doesn't exist. */
export async function scanLocalBlocs(siteDir: string): Promise<Set<string>> {
    const root = join(siteDir, "blocs");
    if (!existsSync(root)) {
        return new Set();
    }
    const blocs = await scanDevBlocs(root, { quiet: true });
    return new Set(blocs.map((b) => b.tag));
}

export type Availability = {
    remoteBlocs: Set<string>;
    localBlocs: Set<string>;
};

/** Single-shot fetch+scan of every set the validator needs. */
export async function gatherAvailability(adminBase: URL, token: string, siteDir: string): Promise<Availability> {
    const [remoteBlocs, localBlocs] = await Promise.all([fetchRemoteBlocs(adminBase, token), scanLocalBlocs(siteDir)]);
    return { remoteBlocs, localBlocs };
}
