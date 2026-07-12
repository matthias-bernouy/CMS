import { ADMIN_ROLE, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import type { Grant } from "@bernouy/cms-permissions";
import { SYSTEM_FUNCTIONS_SOURCE_URN } from "@bernouy/cms-functions";
import {
    isEndpointUrn,
    isSystemSourceUrn,
    parseUrn,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    type Source,
    type SourceEndpoint,
    type SourceEndpointAccessMode,
    type SourceRepository,
} from "@bernouy/cms-sources";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

export function roleGatewayAccessMode(roleId: string): SourceEndpointAccessMode {
    if (roleId === PUBLIC_ROLE) return "public";
    if (roleId === USER_ROLE) return "auth";
    return "admin";
}

export function roleCanBeGrantedEndpoint(roleId: string, endpoint: SourceEndpoint): boolean {
    if (roleId === ADMIN_ROLE) return true;
    return sourceEndpointAccessAllows(sourceEndpointAccessMode(endpoint), roleGatewayAccessMode(roleId));
}

export function isGrantableGatewaySource(source: Source): boolean {
    return !isSystemSourceUrn(source.urn) || source.urn === SYSTEM_FUNCTIONS_SOURCE_URN;
}

export function isGatewayPermission(permission: string): boolean {
    return isEndpointUrn(permission);
}

export async function getGatewayEndpoint(
    sources: SourceRepository | null,
    permission: string,
): Promise<SourceEndpoint | null> {
    if (!sources || !isGatewayPermission(permission)) return null;
    const parsed = parseUrn(permission);
    if (!parsed?.endpoint) return null;
    if (sources.getEndpointForAuthorization) {
        return sources.getEndpointForAuthorization(permission);
    }
    return sources.getEndpoint(permission);
}

export async function assertGatewayGrantsWithinAccess(
    sources: SourceRepository | null,
    roleId: string,
    grants: readonly Grant[],
): Promise<void> {
    for (const grant of grants) {
        const endpoint = await getGatewayEndpoint(sources, grant.permission);
        if (!endpoint) continue;
        if (roleCanBeGrantedEndpoint(roleId, endpoint)) continue;
        throw new InvalidParam("grants", `role "${roleId}" cannot be granted ${grant.permission}`);
    }
}
