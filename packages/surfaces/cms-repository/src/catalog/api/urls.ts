export function repositoryCatalogIntegrationUrl(kind: string): string {
    return `/integrations?${new URLSearchParams({ kind }).toString()}`;
}

export function repositoryCatalogVersionUrl(kind: string, version: string): string {
    return `/integrations?${new URLSearchParams({ kind, version }).toString()}`;
}

export function repositoryReleaseNotesDownloadPath(kind: string, version: string): string {
    return `/.cms/repository/api/integrations/release-notes?${new URLSearchParams({ kind, version }).toString()}`;
}
