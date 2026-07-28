import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";

export const REPOSITORY_CATALOG_ROOT = "/integrations";

export function repositoryPackageDownloadPath(kind: string, version: string): string {
    const query = new URLSearchParams({
        kind: assertIntegrationPackageKind(kind),
        version: assertIntegrationPackageVersion(version),
    });
    return `/.cms/repository/api/integrations/package?${query.toString()}`;
}

export function repositoryVerificationBundleDownloadPath(digest: string): string {
    if (!/^[a-f0-9]{64}$/u.test(digest)) {
        throw new TypeError("Verification bundle digest must be lowercase SHA-256");
    }
    return `/.cms/repository/api/integrations/verification-bundle?${new URLSearchParams({ digest }).toString()}`;
}
