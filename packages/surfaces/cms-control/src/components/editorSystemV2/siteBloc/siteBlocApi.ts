import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

export type SiteBlocMetadata = {
    name: string;
    group: string;
    description: string;
};

export type BlocCatalogueItem = {
    tag: string;
    name: string;
    group: string;
    description: string;
    state: "published" | "draft" | "archived";
    origin: { kind: "site-builder" | "integration" | "code-managed" };
    publishedRevision: number | null;
    directDependencies: string[];
    transitiveDependencies: string[];
    publishedTransitiveDependencies: string[];
};

export async function loadSiteBloc(tag: string): Promise<SiteBlocDefinition> {
    return requestJson(siteBlocUrl("site-bloc", tag));
}

export async function loadBlocCatalogue(): Promise<BlocCatalogueItem[]> {
    return requestJson(`${getMetaBasePath()}/api/bloc/catalogue`);
}

export async function saveSiteBloc(
    definition: SiteBlocDefinition,
    metadata: SiteBlocMetadata,
    content: string,
): Promise<SiteBlocDefinition> {
    const body = {
        expectedDraftRevision: definition.draftRevision,
        ...metadata,
        defaultContent: definition.draft.defaultContent,
        structureHtml: content,
    };
    return requestJson(siteBlocUrl("site-bloc", definition.tag), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function publishSiteBloc(definition: SiteBlocDefinition): Promise<SiteBlocDefinition> {
    return requestJson(siteBlocUrl("site-bloc/publish", definition.tag), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedDraftRevision: definition.draftRevision }),
    });
}

export async function setSiteBlocArchived(
    definition: SiteBlocDefinition,
    archived: boolean,
): Promise<SiteBlocDefinition> {
    return requestJson(siteBlocUrl("site-bloc", definition.tag), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived, expectedDraftRevision: definition.draftRevision }),
    });
}

export function siteBlocFrameUrl(tag: string, mode: "structure" | "preview", revision: number, nonce: number): string {
    const query = new URLSearchParams({ id: tag, mode, revision: String(revision), nonce: String(nonce) });
    return `${getMetaBasePath()}/api/site-bloc/frame?${query}`;
}

function siteBlocUrl(path: string, tag: string): string {
    return `${getMetaBasePath()}/api/${path}?id=${encodeURIComponent(tag)}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (response.redirected) {
        window.location.href = response.url;
        throw new Error("Authentication is required.");
    }
    if (!response.ok) {
        throw new Error(await responseMessage(response));
    }
    return response.json() as Promise<T>;
}

async function responseMessage(response: Response): Promise<string> {
    const fallback = `Request failed with ${response.status}`;
    try {
        const body = (await response.json()) as { message?: unknown; error?: unknown };
        const message = body.message ?? body.error;
        return typeof message === "string" && message.trim() ? message : fallback;
    } catch {
        return fallback;
    }
}
