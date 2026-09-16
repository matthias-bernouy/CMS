export const COLLECTION_WORKSPACE_SECTIONS = ["overview", "theme", "blocs", "texts"] as const;

export type CollectionWorkspaceSection = (typeof COLLECTION_WORKSPACE_SECTIONS)[number];

export type CollectionWorkspaceRoute = {
    collection?: string;
    section?: CollectionWorkspaceSection;
};

export function collectionWorkspacePath(
    basePath: string,
    collection?: string,
    section: CollectionWorkspaceSection = "overview",
): string {
    const root = `${normalizeBasePath(basePath)}/admin/collections`;
    return collection ? `${root}/${encodeURIComponent(collection)}/${section}` : root;
}

export function collectionWorkspaceRouteFromPath(pathname: string, basePath: string): CollectionWorkspaceRoute | null {
    const root = `${normalizeBasePath(basePath)}/admin/collections`;
    const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    if (normalized === root) {
        return {};
    }
    if (!normalized.startsWith(`${root}/`)) {
        return null;
    }
    const segments = normalized.slice(root.length + 1).split("/");
    const section = segments[1] ?? "";
    if (segments.length !== 2 || !isCollectionWorkspaceSection(section)) {
        return null;
    }
    try {
        const collection = decodeURIComponent(segments[0] ?? "").trim();
        return collection ? { collection, section } : null;
    } catch {
        return null;
    }
}

export function isCollectionWorkspaceSection(value: string): value is CollectionWorkspaceSection {
    return COLLECTION_WORKSPACE_SECTIONS.includes(value as CollectionWorkspaceSection);
}

function normalizeBasePath(basePath: string): string {
    const normalized = basePath.replace(/\/+$/, "");
    return normalized === "/" ? "" : normalized;
}
