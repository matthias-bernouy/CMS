import type { LocalSnippet } from "./scan";
import { canonicalSnippetHash } from "./scan";
import type { PageStatus } from "../shared/recap";
import { detectConflict, type PushState } from "../shared/state";

export type RemoteSnippetItem = { id: string; identifier: string };

export type ClassifiedSnippet = {
    snippet:    LocalSnippet;
    remoteId:   string | null;
    remoteHash: string | null;
    status:     PageStatus;
};

export async function classifySnippets(
    local:           LocalSnippet[],
    remote:          RemoteSnippetItem[],
    state:           PushState,
    fetchRemoteHash: (identifier: string) => Promise<string>,
    forceAll:        boolean,
): Promise<ClassifiedSnippet[]> {
    const byId = new Map(remote.map(r => [r.identifier, r.id]));
    const out: ClassifiedSnippet[] = [];

    for (const snippet of local) {
        const remoteId = byId.get(snippet.identifier) ?? null;

        if (remoteId === null) {
            out.push({ snippet, remoteId: null, remoteHash: null, status: "new" });
            continue;
        }

        const remoteHash = await fetchRemoteHash(snippet.identifier);
        const key = `snippet:${snippet.identifier}` as const;

        if (!forceAll && detectConflict(state, key, remoteHash)) {
            out.push({ snippet, remoteId, remoteHash, status: "conflict" });
            continue;
        }

        const status: PageStatus = remoteHash === snippet.hash ? "unchanged" : "update";
        out.push({ snippet, remoteId, remoteHash, status });
    }
    return out;
}

type RemoteSnippetPayload = {
    name?:        string;
    description?: string;
    category?:    string;
    content?:     string;
};

export async function fetchRemoteSnippetHash(
    adminBase: URL,
    token:     string,
    identifier: string,
): Promise<string> {
    const url = new URL(`api/snippet?identifier=${encodeURIComponent(identifier)}`, adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const raw = await res.json() as RemoteSnippetPayload;
    return canonicalSnippetHash({
        name:        raw.name        ?? "",
        description: raw.description ?? "",
        category:    raw.category    ?? "",
        content:     raw.content     ?? "",
    });
}
