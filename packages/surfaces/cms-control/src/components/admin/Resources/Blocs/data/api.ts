import { route } from "../../Integrations/api";
import type { AvailableCollection, BlocItem, CollectionDefinition, SiteCollection } from "./model";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(route(path), {
        ...(body === undefined
            ? {}
            : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            typeof value?.error === "string" ? value.error : `Unable to complete the request (${response.status}).`,
        );
    }
    return value as T;
}

export function loadSiteCollections(): Promise<SiteCollection[]> {
    return request("/api/bloc/collections");
}

export function loadBlocs(): Promise<BlocItem[]> {
    return request("/api/bloc/catalogue");
}

export async function availableCollections(): Promise<AvailableCollection[]> {
    const result = await request<{ items: AvailableCollection[] }>("/api/integrations/catalogue?scope=collections");
    return result.items;
}

export async function collectionDefinition(kind: string): Promise<CollectionDefinition> {
    const definitions = await request<IntegrationDefinition[]>("/api/integrations/list");
    const definition = definitions.find((item) => item.kind === kind && item.type === "collection");
    if (!definition || definition.type !== "collection") {
        throw new Error("This collection is no longer available. Refresh the collection library.");
    }
    return definition;
}

export function createCollection(name: string, description: string): Promise<SiteCollection> {
    return request("/api/bloc/collections", { name, description });
}

export function createComposition(collectionId: string, name: string, description: string): Promise<{ tag: string }> {
    const slug =
        name
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60) || "composition";
    return request("/api/site-bloc", {
        collectionId,
        name,
        description,
        tag: `site-${slug}-${crypto.randomUUID().slice(0, 8)}`,
    });
}
