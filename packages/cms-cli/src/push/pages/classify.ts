import type { LocalPage } from "./scan";
import { canonicalHash } from "./scan";
import type { PageStatus } from "../shared/recap";
import { detectConflict, type PushState } from "../shared/state";

export type RemoteListItem = { id: string; path: string };

export type ClassifiedPage = {
    page:       LocalPage;
    /** Remote DB id when the page already exists, null when it's new. */
    remoteId:   string | null;
    /** Remote canonical hash (after the GET full-fetch), null when new. */
    remoteHash: string | null;
    status:     PageStatus;
};

/**
 * Classify each local page against the remote state. Caller supplies a
 * `fetchRemoteHash(id)` callback (one HTTP GET per known page) — kept as
 * a parameter so the unit tests can drive classification without HTTP.
 */
export async function classifyPages(
    local:           LocalPage[],
    remote:          RemoteListItem[],
    state:           PushState,
    fetchRemoteHash: (id: string) => Promise<string>,
    forceAll:        boolean,
): Promise<ClassifiedPage[]> {
    const byPath = new Map(remote.map(r => [r.path, r.id]));
    const out: ClassifiedPage[] = [];

    for (const page of local) {
        const remoteId = byPath.get(page.path) ?? null;

        if (remoteId === null) {
            out.push({ page, remoteId: null, remoteHash: null, status: "new" });
            continue;
        }

        const remoteHash = await fetchRemoteHash(remoteId);
        const key = `page:${page.path}` as const;

        if (!forceAll && detectConflict(state, key, remoteHash)) {
            out.push({ page, remoteId, remoteHash, status: "conflict" });
            continue;
        }

        const status: PageStatus = remoteHash === page.hash ? "unchanged" : "update";
        out.push({ page, remoteId, remoteHash, status });
    }
    return out;
}

type RemotePagePayload = {
    title:       string;
    description: string;
    visible:     string | boolean;
    tags:        string | string[];
    content:     string;
};

/** Fetch a remote page in full and return its canonical hash. */
export async function fetchRemotePageHash(
    adminBase: URL,
    token:     string,
    id:        string,
): Promise<string> {
    const url = new URL(`api/page?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const raw = await res.json() as RemotePagePayload;
    return canonicalHash({
        title:       raw.title       ?? "",
        description: raw.description ?? "",
        visible:     raw.visible === true || raw.visible === "on",
        tags:        Array.isArray(raw.tags) ? raw.tags : (raw.tags ? raw.tags.split(",").filter(Boolean) : []),
        content:     raw.content     ?? "",
    });
}
