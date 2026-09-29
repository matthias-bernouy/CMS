import type { InstallationIdentityScope } from "../identity/InstallationIdentityService";

export function identityScopeKey(scope: InstallationIdentityScope): string {
    if (
        typeof scope.siteId !== "string" ||
        typeof scope.installationId !== "string" ||
        !scope.siteId.trim() ||
        !scope.installationId.trim() ||
        scope.siteId !== scope.siteId.trim() ||
        scope.installationId !== scope.installationId.trim() ||
        scope.siteId.length > 128 ||
        scope.installationId.length > 128
    ) {
        throw new TypeError("site and installation IDs are required");
    }
    return JSON.stringify([scope.siteId, scope.installationId]);
}

export function identitySubjectKey(scope: InstallationIdentityScope, cmsSubjectId: string): string {
    if (
        typeof cmsSubjectId !== "string" ||
        !cmsSubjectId.trim() ||
        cmsSubjectId !== cmsSubjectId.trim() ||
        cmsSubjectId.length > 256
    ) {
        throw new TypeError("CMS subject ID is invalid");
    }
    return JSON.stringify([identityScopeKey(scope), cmsSubjectId]);
}

export function identityAliasKey(scope: InstallationIdentityScope, providerSubjectId: string): string {
    if (
        typeof providerSubjectId !== "string" ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(providerSubjectId)
    ) {
        throw new TypeError("provider subject ID is invalid");
    }
    return JSON.stringify([identityScopeKey(scope), providerSubjectId]);
}
