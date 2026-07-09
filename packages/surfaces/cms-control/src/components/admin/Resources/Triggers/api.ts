import type { TriggerRecord } from "@bernouy/cms-triggers";

export type TriggerListItem = TriggerRecord;

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

export async function setTriggerEnabled(id: string, enabled: boolean): Promise<TriggerListItem> {
    const response = await fetch(route("/api/triggers/enabled"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<TriggerListItem>;
}
