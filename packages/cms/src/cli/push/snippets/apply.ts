import type { LocalSnippet } from "./scan";
import type { ClassifiedSnippet, RemoteSnippetItem } from "./classify";

export type ApplyResult = {
    pushed: { identifier: string; localHash: string }[];
    failed: { identifier: string; error:     string }[];
};

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
});

export async function fetchRemoteSnippetList(adminBase: URL, token: string): Promise<RemoteSnippetItem[]> {
    const url = new URL("api/snippet/list", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json() as { id: string; identifier: string }[];
    if (!Array.isArray(data)) throw new Error(`GET ${url} did not return an array`);
    return data.map(s => ({ id: s.id, identifier: s.identifier }));
}

/**
 * POST every "new" entry, refetch the list to pick up freshly-minted ids,
 * then PUT the full payload for every "new" + "update" entry.
 */
export async function applyPushSnippets(
    adminBase: URL,
    token:     string,
    entries:   ClassifiedSnippet[],
): Promise<ApplyResult> {
    const result: ApplyResult = { pushed: [], failed: [] };
    const writes = entries.filter(e => e.status === "new" || e.status === "update");

    for (const e of entries.filter(e => e.status === "new")) {
        try { await postSnippet(adminBase, token, e.snippet); }
        catch (err) { result.failed.push({ identifier: e.snippet.identifier, error: msg(err) }); }
    }

    const idByIdentifier = new Map(
        (await fetchRemoteSnippetList(adminBase, token)).map(s => [s.identifier, s.id]),
    );

    for (const e of writes) {
        if (result.failed.some(f => f.identifier === e.snippet.identifier)) continue;
        const id = e.remoteId ?? idByIdentifier.get(e.snippet.identifier);
        if (!id) {
            result.failed.push({ identifier: e.snippet.identifier, error: "id missing after POST" });
            continue;
        }
        try {
            await putSnippet(adminBase, token, id, e.snippet);
            result.pushed.push({ identifier: e.snippet.identifier, localHash: e.snippet.hash });
        } catch (err) {
            result.failed.push({ identifier: e.snippet.identifier, error: msg(err) });
        }
    }
    return result;
}

async function postSnippet(adminBase: URL, token: string, s: LocalSnippet): Promise<void> {
    const url = new URL("api/snippet", adminBase).href;
    const body = { identifier: s.identifier, name: s.meta.name, category: s.meta.category };
    const res = await fetch(url, { method: "POST", headers: HEADERS_JSON(token), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`POST ${url} → HTTP ${res.status}${await tail(res)}`);
}

async function putSnippet(adminBase: URL, token: string, id: string, s: LocalSnippet): Promise<void> {
    const url = new URL("api/snippet", adminBase).href;
    const body = {
        id,
        name:        s.meta.name,
        description: s.meta.description,
        category:    s.meta.category,
        content:     s.content,
    };
    const res = await fetch(url, { method: "PUT", headers: HEADERS_JSON(token), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`PUT ${url} → HTTP ${res.status}${await tail(res)}`);
}

async function tail(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    return text ? ` — ${text}` : "";
}

function msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
