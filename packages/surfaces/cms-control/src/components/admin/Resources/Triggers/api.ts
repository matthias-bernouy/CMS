import type { TriggerRecord } from "@bernouy/cms-triggers";
import type { FunctionCatalogSource } from "../Functions/api";

export type TriggerListItem = TriggerRecord;

export type TriggerFunctionItem = {
    id: string;
    label: string;
    method: string;
    params?: Record<string, unknown>;
    body?: unknown;
};

export function basePath(): string {
    const raw = document.querySelector('meta[name="basePath"]')?.getAttribute("content") ?? "";
    return raw.replace(/\/+$/, "");
}

export function route(path: string): string {
    return `${basePath()}${path}`;
}

export async function fetchTriggers(): Promise<TriggerListItem[]> {
    const response = await fetch(route("/api/triggers"), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<TriggerListItem[]>;
}

export async function fetchTriggerCatalog(): Promise<{ sources: FunctionCatalogSource[]; functions: TriggerFunctionItem[] }> {
    const [sourcesResponse, functionsResponse] = await Promise.all([
        fetch(route("/api/functions/catalog"), { headers: { Accept: "application/json" } }),
        fetch(route("/api/functions"), { headers: { Accept: "application/json" } }),
    ]);
    if (!sourcesResponse.ok) throw new Error(await sourcesResponse.text());
    if (!functionsResponse.ok) throw new Error(await functionsResponse.text());
    return {
        sources: await sourcesResponse.json() as FunctionCatalogSource[],
        functions: await functionsResponse.json() as TriggerFunctionItem[],
    };
}

export async function createTriggerDefinition(definition: unknown, enabled: boolean): Promise<TriggerListItem> {
    const response = await fetch(route("/api/triggers/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition, enabled }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<TriggerListItem>;
}

export async function setTriggerEnabled(id: string, enabled: boolean): Promise<TriggerListItem> {
    const response = await fetch(route("/api/triggers/enabled"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<TriggerListItem>;
}
