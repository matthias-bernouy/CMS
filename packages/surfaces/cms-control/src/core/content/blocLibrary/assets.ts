import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export function integrationAssetUrl(basePath: string, kind: string, version: string | undefined, path: string): string {
    const params = new URLSearchParams({ kind, path });
    if (version) {
        params.set("version", version);
    }
    return `${basePath}/api/integrations/asset?${params}`;
}

export function collectionAssets(basePath: string, definition?: IntegrationDefinition, version = definition?.version) {
    if (!definition) {
        return {};
    }
    return {
        ...(definition.icon?.path
            ? { iconUrl: integrationAssetUrl(basePath, definition.kind, version, definition.icon.path) }
            : {}),
        ...(definition.cover?.path
            ? { coverUrl: integrationAssetUrl(basePath, definition.kind, version, definition.cover.path) }
            : {}),
    };
}
