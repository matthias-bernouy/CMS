import type { LocalPage } from "./scan";
import type { ClassifiedPage, RemoteListItem } from "./classify";

export type ApplyResult = {
    pushed: { path: string; localHash: string }[];
    failed: { path: string; error: string }[];
};

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
});

/** GET /api/page/list — used by the orchestrator and after creating new pages. */
export async function fetchRemoteList(adminBase: URL, token: string): Promise<RemoteListItem[]> {
    const url = new URL("api/page/list", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    const data = (await res.json()) as { id: string; path: string }[];
    if (!Array.isArray(data)) {
        throw new Error(`GET ${url} did not return an array`);
    }
    return data.map((p) => ({ id: p.id, path: p.path }));
}

/**
 * Push every entry classified `new` / `update`. Strategy: POST all new pages
 * first (creates them with title+path), refetch the list to learn the new
 * ids, then PUT the full payload for both new and update entries.
 */
export async function applyPushPages(adminBase: URL, token: string, entries: ClassifiedPage[]): Promise<ApplyResult> {
    const result: ApplyResult = { pushed: [], failed: [] };
    const writes = entries.filter((e) => e.status === "new" || e.status === "update");

    for (const e of entries.filter((e) => e.status === "new")) {
        try {
            await postPage(adminBase, token, e.page);
        } catch (err) {
            result.failed.push({ path: e.page.path, error: msg(err) });
        }
    }

    const idByPath = new Map((await fetchRemoteList(adminBase, token)).map((r) => [r.path, r.id]));

    for (const e of writes) {
        if (result.failed.some((f) => f.path === e.page.path)) {
            continue;
        }
        const id = e.remoteId ?? idByPath.get(e.page.path);
        if (!id) {
            result.failed.push({ path: e.page.path, error: "id missing after POST" });
            continue;
        }
        try {
            await putPage(adminBase, token, id, e.page);
            result.pushed.push({ path: e.page.path, localHash: e.page.hash });
        } catch (err) {
            result.failed.push({ path: e.page.path, error: msg(err) });
        }
    }
    return result;
}

async function postPage(adminBase: URL, token: string, page: LocalPage): Promise<void> {
    const url = new URL("api/page", adminBase).href;
    const body = { title: page.frontmatter.title || page.path, path: page.path };
    const res = await fetch(url, { method: "POST", headers: HEADERS_JSON(token), body: JSON.stringify(body) });
    if (!res.ok) {
        throw new Error(`POST ${url} → HTTP ${res.status}${await tail(res)}`);
    }
}

async function putPage(adminBase: URL, token: string, id: string, page: LocalPage): Promise<void> {
    const url = new URL("api/page", adminBase).href;
    const body = {
        id,
        title: page.frontmatter.title || page.path,
        path: page.path,
        content: page.content,
        description: page.frontmatter.description,
        visible: page.frontmatter.visible,
        tags: page.frontmatter.tags,
    };
    const res = await fetch(url, { method: "PUT", headers: HEADERS_JSON(token), body: JSON.stringify(body) });
    if (!res.ok) {
        throw new Error(`PUT ${url} → HTTP ${res.status}${await tail(res)}`);
    }
}

async function tail(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    return text ? ` — ${text}` : "";
}

function msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
