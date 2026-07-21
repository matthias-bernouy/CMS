import type { ClassifiedIntegration, RemoteIntegrationItem } from "./classify";
import type { LocalIntegrationImport } from "./scan";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import {
    integrationDependencies,
    orderIntegrationWritesByDependencies,
    type IntegrationDefinitionLookup,
} from "./order";

export type ApplyResult = {
    pushed: { id: string; localHash: string }[];
    failed: { id: string; error: string }[];
};

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
});

export async function fetchRemoteIntegrationList(adminBase: URL, token: string): Promise<RemoteIntegrationItem[]> {
    const url = new URL("api/integrations/installations", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
        throw new Error(`GET ${url} did not return an array`);
    }
    return data as RemoteIntegrationItem[];
}

export async function fetchRemoteIntegrationDefinitions(
    adminBase: URL,
    token: string,
): Promise<IntegrationDefinition[]> {
    const url = new URL("api/integrations/list", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
        throw new Error(`GET ${url} did not return an array`);
    }
    return data as IntegrationDefinition[];
}

/** Create every new integration and rerun every changed integration installation. */
export async function applyPushIntegrations(
    adminBase: URL,
    token: string,
    entries: ClassifiedIntegration[],
    definitions: IntegrationDefinitionLookup = new Map(),
): Promise<ApplyResult> {
    const result: ApplyResult = { pushed: [], failed: [] };
    const failedKinds = new Set<string>();
    for (const e of orderIntegrationWritesByDependencies(entries, definitions)) {
        const failedDependency = integrationDependencies(e, definitions).find(
            (dependency) => dependency.optional !== true && failedKinds.has(dependency.kind),
        );
        if (failedDependency) {
            result.failed.push({
                id: e.integration.id,
                error: `Skipped because dependency "${failedDependency.kind}" failed to push`,
            });
            failedKinds.add(e.integration.id);
            continue;
        }
        try {
            if (e.status === "new") {
                await createIntegration(adminBase, token, e.integration.request);
            } else {
                await rerunIntegration(adminBase, token, e.integration.id, e.integration.request);
            }
            result.pushed.push({ id: e.integration.id, localHash: e.integration.hash });
        } catch (err) {
            result.failed.push({ id: e.integration.id, error: msg(err) });
            failedKinds.add(e.integration.id);
        }
    }
    return result;
}

async function createIntegration(adminBase: URL, token: string, request: LocalIntegrationImport): Promise<void> {
    const url = new URL("api/integrations/import", adminBase).href;
    const res = await fetch(url, {
        method: "POST",
        headers: HEADERS_JSON(token),
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        throw new Error(`POST ${url} → HTTP ${res.status}${await tail(res)}`);
    }
}

async function rerunIntegration(
    adminBase: URL,
    token: string,
    id: string,
    request: LocalIntegrationImport,
): Promise<void> {
    const url = new URL(`api/integrations/installations/rerun?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, {
        method: "POST",
        headers: HEADERS_JSON(token),
        body: JSON.stringify({
            answers: request.answers,
            options: { ...(request.options ?? {}), force: true },
        }),
    });
    if (!res.ok) {
        throw new Error(`POST ${url} → HTTP ${res.status}${await tail(res)}`);
    }
}

async function tail(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    return text ? ` — ${text}` : "";
}
function msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
