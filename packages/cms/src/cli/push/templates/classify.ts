import type { LocalTemplate } from "./scan";
import { canonicalTemplateHash } from "./scan";
import type { PageStatus } from "../shared/recap";
import { detectConflict, type PushState } from "../shared/state";

export type RemoteTemplateItem = { id: string; identifier: string };

export type ClassifiedTemplate = {
    template:   LocalTemplate;
    remoteId:   string | null;
    remoteHash: string | null;
    status:     PageStatus;
};

export async function classifyTemplates(
    local:           LocalTemplate[],
    remote:          RemoteTemplateItem[],
    state:           PushState,
    fetchRemoteHash: (id: string) => Promise<string>,
    forceAll:        boolean,
): Promise<ClassifiedTemplate[]> {
    const idByIdentifier = new Map(remote.map(r => [r.identifier, r.id]));
    const out: ClassifiedTemplate[] = [];

    for (const template of local) {
        const remoteId = idByIdentifier.get(template.identifier) ?? null;

        if (remoteId === null) {
            out.push({ template, remoteId: null, remoteHash: null, status: "new" });
            continue;
        }

        const remoteHash = await fetchRemoteHash(remoteId);
        const key = `template:${template.identifier}` as const;

        if (!forceAll && detectConflict(state, key, remoteHash)) {
            out.push({ template, remoteId, remoteHash, status: "conflict" });
            continue;
        }

        const status: PageStatus = remoteHash === template.hash ? "unchanged" : "update";
        out.push({ template, remoteId, remoteHash, status });
    }
    return out;
}

type RemoteTemplatePayload = {
    name?:        string;
    description?: string;
    category?:    string;
    content?:     string;
};

/** Templates are fetched by db id (no by-identifier endpoint exposed yet). */
export async function fetchRemoteTemplateHash(
    adminBase: URL,
    token:     string,
    id:        string,
): Promise<string> {
    const url = new URL(`api/template?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const raw = await res.json() as RemoteTemplatePayload;
    return canonicalTemplateHash({
        name:        raw.name        ?? "",
        description: raw.description ?? "",
        category:    raw.category    ?? "",
        content:     raw.content     ?? "",
    });
}
