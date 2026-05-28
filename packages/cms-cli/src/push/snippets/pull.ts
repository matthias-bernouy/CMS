import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serializeFrontmatter } from "src/cli/push/shared/frontmatterWrite";
import { categoryToFolder } from "src/cli/push/shared/categoryFolder";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullSnippetsResult = { pulled: string[]; failed: { identifier: string; error: string }[] };

type RemoteSnippet = {
    identifier:  string;
    name:        string;
    description: string;
    category:    string;
    content:     string;
};

export async function pullSnippets(adminBase: URL, token: string, siteDir: string): Promise<PullSnippetsResult> {
    const out: PullSnippetsResult = { pulled: [], failed: [] };
    const list = await fetchList(adminBase, token);

    for (const { identifier } of list) {
        try {
            const s = await fetchOne(adminBase, token, identifier);
            await writeSnippet(siteDir, s);
            out.pulled.push(identifier);
        } catch (err) {
            out.failed.push({ identifier, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchList(adminBase: URL, token: string): Promise<{ identifier: string }[]> {
    const url = new URL("api/snippet/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as { identifier: string }[];
}

async function fetchOne(adminBase: URL, token: string, identifier: string): Promise<RemoteSnippet> {
    const url = new URL(`api/snippet?identifier=${encodeURIComponent(identifier)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as RemoteSnippet;
}

async function writeSnippet(siteDir: string, s: RemoteSnippet): Promise<void> {
    const folder = categoryToFolder(s.category ?? "");
    const dir    = join(siteDir, "snippets", folder);
    await mkdir(dir, { recursive: true });
    const fm = serializeFrontmatter({
        name:        s.name        ?? "",
        description: s.description ?? "",
    });
    await writeFile(join(dir, `${s.identifier}.html`), fm + (s.content ?? ""), "utf-8");
}
