import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";

export type RepositoryCatalogRoute =
    | Readonly<{ page: "list" }>
    | Readonly<{ page: "integration"; kind: string }>
    | Readonly<{ page: "version"; kind: string; version: string }>;

export const REPOSITORY_CATALOG_ROOT = "/integrations";

export function parseRepositoryCatalogRoute(pathname: string): RepositoryCatalogRoute | null {
    if (pathname === REPOSITORY_CATALOG_ROOT) {
        return { page: "list" };
    }
    if (!pathname.startsWith(REPOSITORY_CATALOG_ROOT + "/") || pathname.includes("%")) {
        return null;
    }
    const segments = pathname.slice(REPOSITORY_CATALOG_ROOT.length + 1).split("/");
    try {
        if (segments.length === 1) {
            return { page: "integration", kind: assertIntegrationPackageKind(segments[0]) };
        }
        if (segments.length === 3 && segments[1] === "versions") {
            return {
                page: "version",
                kind: assertIntegrationPackageKind(segments[0]),
                version: assertIntegrationPackageVersion(segments[2]),
            };
        }
    } catch {
        return null;
    }
    return null;
}

export function repositoryIntegrationPath(kind: string): string {
    return `${REPOSITORY_CATALOG_ROOT}/${assertIntegrationPackageKind(kind)}`;
}

export function repositoryVersionPath(kind: string, version: string): string {
    return `${repositoryIntegrationPath(kind)}/versions/${assertIntegrationPackageVersion(version)}`;
}

export function repositoryPackageDownloadPath(kind: string, version: string): string {
    const query = new URLSearchParams({
        kind: assertIntegrationPackageKind(kind),
        version: assertIntegrationPackageVersion(version),
    });
    return `/.cms/repository/api/integrations/package?${query.toString()}`;
}
