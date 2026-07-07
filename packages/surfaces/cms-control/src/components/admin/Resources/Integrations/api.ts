import type {
    IntegrationImportPayload,
} from "./model";

export type IntegrationImportResponse = {
    instance?: {
        id: string;
        kind: string;
        label: string;
    };
    run?: {
        id: string;
        runNumber: number;
        status: string;
    };
};

export function basePath(): string {
    const raw = document.querySelector('meta[name="basePath"]')?.getAttribute("content") ?? "";
    return raw.replace(/\/+$/, "");
}

export function route(path: string): string {
    return `${basePath()}${path}`;
}

export async function importIntegration(payload: IntegrationImportPayload): Promise<IntegrationImportResponse> {
    const result = await postJson<IntegrationImportResponse>(route("/api/integrations/import"), payload);
    document.dispatchEvent(new Event("integration:updated", { bubbles: true }));
    return result;
}

export async function rerunIntegrationInstance(id: string): Promise<void> {
    await postJson(`${route("/api/integrations/instances/rerun")}?id=${encodeURIComponent(id)}`, {});
    document.dispatchEvent(new Event("integration:updated", { bubbles: true }));
    document.dispatchEvent(new Event("cms-source:reload", { bubbles: true }));
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
}
