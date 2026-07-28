import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { REPOSITORY_CATALOG_ROOT } from "../routes";

export function repositoryCatalogIntegrationUrl(kind: string): string {
    return `${REPOSITORY_CATALOG_ROOT}?${new URLSearchParams({ kind: assertIntegrationPackageKind(kind) }).toString()}`;
}

export function repositoryCatalogVersionUrl(kind: string, version: string): string {
    return `${REPOSITORY_CATALOG_ROOT}?${new URLSearchParams({
        kind: assertIntegrationPackageKind(kind),
        version: assertIntegrationPackageVersion(version),
    }).toString()}`;
}

export function repositoryReleaseNotesDownloadPath(kind: string, version: string): string {
    return `/.cms/repository/api/integrations/release-notes?${new URLSearchParams({
        kind: assertIntegrationPackageKind(kind),
        version: assertIntegrationPackageVersion(version),
    }).toString()}`;
}
