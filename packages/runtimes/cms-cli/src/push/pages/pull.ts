import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { serializeFrontmatter } from "../shared/frontmatterWrite";
import { safeJoin } from "../shared/safeJoin";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullPagesResult = { pulled: string[]; failed: { path: string; error: string }[] };

type RemotePage = {
    path: string;
    title: string;
    description: string;
    content: string;
    visible: string | boolean;
    tags: string | string[];
};

/**
 * Fetch every remote page and write each as `<siteDir>/pages/<…>.html`
 * with frontmatter (title/description/visible/tags). Path → file mapping
 * is the inverse of `pages/scan.ts:fileToUrlPath`: `/` → `index.html`,
 * `/blog/post-1` → `blog/post-1.html`.
 */
export async function pullPages(adminBase: URL, token: string, siteDir: string): Promise<PullPagesResult> {
    const out: PullPagesResult = { pulled: [], failed: [] };
    const list = await fetchList(adminBase, token);
    for (const { id, path } of list) {
        try {
            const page = await fetchOne(adminBase, token, id);
            await writePage(siteDir, path, page);
            out.pulled.push(path);
        } catch (err) {
            out.failed.push({ path, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchList(adminBase: URL, token: string): Promise<{ id: string; path: string }[]> {
    const url = new URL("api/page/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    const data = (await res.json()) as { id: string; path: string }[];
    return data;
}

async function fetchOne(adminBase: URL, token: string, id: string): Promise<RemotePage> {
    const url = new URL(`api/page?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    return (await res.json()) as RemotePage;
}

async function writePage(siteDir: string, urlPath: string, page: RemotePage): Promise<void> {
    const file = safeJoin(siteDir, "pages", urlPathToFile(urlPath));
    await mkdir(dirname(file), { recursive: true });

    const visible = page.visible === true || page.visible === "on";
    const tags = Array.isArray(page.tags) ? page.tags : page.tags ? page.tags.split(",").filter(Boolean) : [];

    const fm = serializeFrontmatter({
        title: page.title ?? "",
        description: page.description ?? "",
        visible,
        tags,
    });

    await writeFile(file, fm + (page.content ?? ""), "utf-8");
}

function urlPathToFile(p: string): string {
    if (p === "/") {
        return "index.html";
    }
    return p.replace(/^\//, "") + ".html";
}
