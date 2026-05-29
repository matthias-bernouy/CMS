import { mkdir, writeFile } from "node:fs/promises";
import { serializeFrontmatter } from "cms-cli/push/shared/frontmatterWrite";
import { categoryToFolder } from "cms-cli/push/shared/categoryFolder";
import { safeJoin } from "cms-cli/push/shared/safeJoin";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullTemplatesResult = { pulled: string[]; skipped: { reason: string }[]; failed: { identifier: string; error: string }[] };

type RemoteTemplate = {
    identifier?: string;
    name:        string;
    description: string;
    category:    string;
    content:     string;
};

export async function pullTemplates(adminBase: URL, token: string, siteDir: string): Promise<PullTemplatesResult> {
    const out: PullTemplatesResult = { pulled: [], skipped: [], failed: [] };
    const list = await fetchList(adminBase, token);

    for (const meta of list) {
        if (!meta.identifier) {
            out.skipped.push({ reason: `template "${meta.name}" has no identifier — skipped (legacy template, manage it via the admin UI)` });
            continue;
        }
        try {
            const t = await fetchOne(adminBase, token, meta.id);
            await writeTemplate(siteDir, meta.identifier, t);
            out.pulled.push(meta.identifier);
        } catch (err) {
            out.failed.push({ identifier: meta.identifier, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchList(adminBase: URL, token: string): Promise<{ id: string; identifier?: string; name: string }[]> {
    const url = new URL("api/template/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as { id: string; identifier?: string; name: string }[];
}

async function fetchOne(adminBase: URL, token: string, id: string): Promise<RemoteTemplate> {
    const url = new URL(`api/template?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as RemoteTemplate;
}

async function writeTemplate(siteDir: string, identifier: string, t: RemoteTemplate): Promise<void> {
    const folder = categoryToFolder(t.category ?? "");
    const dir    = safeJoin(siteDir, "templates", folder);
    const file   = safeJoin(dir, `${identifier}.html`);
    await mkdir(dir, { recursive: true });
    const fm = serializeFrontmatter({
        name:        t.name        ?? "",
        description: t.description ?? "",
    });
    await writeFile(file, fm + (t.content ?? ""), "utf-8");
}
