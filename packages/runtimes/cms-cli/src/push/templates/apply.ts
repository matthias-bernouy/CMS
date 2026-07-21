import type { LocalTemplate } from "./scan";
import type { ClassifiedTemplate, RemoteTemplateItem } from "./classify";

export type ApplyResult = {
    pushed: { identifier: string; localHash: string }[];
    failed: { identifier: string; error: string }[];
};

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
});

export async function fetchRemoteTemplateList(adminBase: URL, token: string): Promise<RemoteTemplateItem[]> {
    const url = new URL("api/template/list", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    const data = (await res.json()) as { id: string; identifier: string }[];
    if (!Array.isArray(data)) {
        throw new Error(`GET ${url} did not return an array`);
    }
    return data.map((t) => ({ id: t.id, identifier: t.identifier }));
}

export async function applyPushTemplates(
    adminBase: URL,
    token: string,
    entries: ClassifiedTemplate[],
): Promise<ApplyResult> {
    const result: ApplyResult = { pushed: [], failed: [] };
    const writes = entries.filter((e) => e.status === "new" || e.status === "update");

    for (const e of entries.filter((e) => e.status === "new")) {
        try {
            await postTemplate(adminBase, token, e.template);
        } catch (err) {
            result.failed.push({ identifier: e.template.identifier, error: msg(err) });
        }
    }

    const idByIdentifier = new Map((await fetchRemoteTemplateList(adminBase, token)).map((t) => [t.identifier, t.id]));

    for (const e of writes) {
        if (result.failed.some((f) => f.identifier === e.template.identifier)) {
            continue;
        }
        const id = e.remoteId ?? idByIdentifier.get(e.template.identifier);
        if (!id) {
            result.failed.push({
                identifier: e.template.identifier,
                error: "POST succeeded but the template list does not return its identifier — likely a stale server (redeploy the CMS so it accepts and exposes TTemplate.identifier).",
            });
            continue;
        }
        try {
            await putTemplate(adminBase, token, id, e.template);
            result.pushed.push({ identifier: e.template.identifier, localHash: e.template.hash });
        } catch (err) {
            result.failed.push({ identifier: e.template.identifier, error: msg(err) });
        }
    }
    return result;
}

async function postTemplate(adminBase: URL, token: string, t: LocalTemplate): Promise<void> {
    const url = new URL("api/template", adminBase).href;
    const body = { identifier: t.identifier, name: t.meta.name, category: t.meta.category };
    const res = await fetch(url, { method: "POST", headers: HEADERS_JSON(token), body: JSON.stringify(body) });
    if (!res.ok) {
        throw new Error(`POST ${url} → HTTP ${res.status}${await tail(res)}`);
    }
}

async function putTemplate(adminBase: URL, token: string, id: string, t: LocalTemplate): Promise<void> {
    const url = new URL("api/template", adminBase).href;
    const body = {
        id,
        name: t.meta.name,
        description: t.meta.description,
        category: t.meta.category,
        content: t.content,
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
