import type {
    IntegrationDefinition,
    IntegrationImportPayload,
    IntegrationInstanceRow,
} from "./model";

export function basePath(): string {
    const raw = document.querySelector('meta[name="basePath"]')?.getAttribute("content") ?? "";
    return raw.replace(/\/+$/, "");
}

export function route(path: string): string {
    return `${basePath()}${path}`;
}

export async function fetchDefinitions(): Promise<IntegrationDefinition[]> {
    return getJson(route("/api/integrations/list"));
}

export async function fetchInstances(): Promise<IntegrationInstanceRow[]> {
    return getJson(route("/api/integrations/instances"));
}

export async function importIntegration(payload: IntegrationImportPayload): Promise<void> {
    await postJson(route("/api/integrations/import"), payload);
    document.dispatchEvent(new Event("integration:updated", { bubbles: true }));
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
}

async function postJson(url: string, body: unknown): Promise<void> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
}
