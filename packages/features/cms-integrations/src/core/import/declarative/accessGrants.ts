import {
    functionEndpointUrn,
    type CmsFunction,
} from "@bernouy/cms-functions";
import {
    PUBLIC_ROLE,
    USER_ROLE,
    type Grant,
    type RoleDefinition,
    type RolesRepository,
} from "@bernouy/cms-permissions";
import {
    sourceEndpointAccessMode,
    type Source,
    type SourceEndpointAccessMode,
} from "@bernouy/cms-sources";
import { IntegrationRuntimeError } from "../../errors";

type IntegrationAccessGrant = {
    roleId: typeof PUBLIC_ROLE | typeof USER_ROLE;
    permission: string;
};

export function buildIntegrationAccessGrants(
    sources: Source[],
    functions: CmsFunction[],
): IntegrationAccessGrant[] {
    const grants: IntegrationAccessGrant[] = [];
    for (const source of sources) {
        for (const endpoint of source.endpoints) {
            const roleId = roleForAccessMode(sourceEndpointAccessMode(endpoint));
            if (roleId) grants.push({ roleId, permission: endpoint.urn });
        }
    }
    for (const fn of functions) {
        const roleId = roleForAccessMode(fn.access?.mode ?? "admin");
        if (roleId) grants.push({ roleId, permission: functionEndpointUrn(fn.id) });
    }
    return grants;
}

export async function applyIntegrationAccessGrants(
    roles: RolesRepository | undefined,
    grants: IntegrationAccessGrant[],
): Promise<void> {
    if (!grants.length) return;
    if (!roles) throw new IntegrationRuntimeError("roles repository not configured");

    for (const [roleId, permissions] of grantsByRole(grants)) {
        const current = await roles.get(roleId) ?? defaultBuiltInRole(roleId);
        const existing = new Set(current.grants.map((grant: Grant) => grant.permission));
        const nextGrants: Grant[] = [...current.grants];
        for (const permission of permissions) {
            if (!existing.has(permission)) nextGrants.push({ permission });
        }
        if (nextGrants.length !== current.grants.length) {
            await roles.upsert({ ...current, grants: nextGrants });
        }
    }
}

function grantsByRole(
    grants: IntegrationAccessGrant[],
): Map<IntegrationAccessGrant["roleId"], Set<string>> {
    const byRole = new Map<IntegrationAccessGrant["roleId"], Set<string>>();
    for (const grant of grants) {
        if (!byRole.has(grant.roleId)) byRole.set(grant.roleId, new Set());
        byRole.get(grant.roleId)!.add(grant.permission);
    }
    return byRole;
}

function roleForAccessMode(
    mode: SourceEndpointAccessMode,
): typeof PUBLIC_ROLE | typeof USER_ROLE | null {
    if (mode === "public") return PUBLIC_ROLE;
    if (mode === "auth") return USER_ROLE;
    return null;
}

function defaultBuiltInRole(roleId: IntegrationAccessGrant["roleId"]): RoleDefinition {
    if (roleId === PUBLIC_ROLE) return { id: PUBLIC_ROLE, label: "Public", builtin: true, grants: [] };
    return { id: USER_ROLE, label: "User", builtin: true, grants: [] };
}
