import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
    await mkdir(join(siteDir, "snippets"), { recursive: true });

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
    const file = join(siteDir, "snippets", `${s.identifier}.html`);
    const fm = [
        "---",
        `name: ${quote(s.name)}`,
        `description: ${quote(s.description)}`,
        `category: ${quote(s.category)}`,
        "---",
        "",
    ].join("\n");
    await writeFile(file, fm + (s.content ?? ""), "utf-8");
}

function quote(v: string): string { return `"${(v ?? "").replace(/"/g, '\\"')}"`; }
