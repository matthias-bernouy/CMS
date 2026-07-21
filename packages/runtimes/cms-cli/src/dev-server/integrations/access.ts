import {
    PUBLIC_ROLE,
    USER_ROLE,
    type Grant,
    type RoleDefinition,
    type RolesRepository,
} from "@bernouy/cms-permissions";
import { sourceEndpointAccessMode, type SourceRepository } from "@bernouy/cms-sources";

export async function seedDevSourceAccess(roles: RolesRepository, sources: SourceRepository): Promise<void> {
    const grants = new Map<string, Set<string>>([
        [PUBLIC_ROLE, new Set()],
        [USER_ROLE, new Set()],
    ]);
    for (const source of await sources.getAllSources()) {
        for (const endpoint of source.endpoints) {
            const mode = sourceEndpointAccessMode(endpoint);
            if (mode === "public") {
                grants.get(PUBLIC_ROLE)!.add(endpoint.urn);
            }
            if (mode === "auth") {
                grants.get(USER_ROLE)!.add(endpoint.urn);
            }
        }
    }
    for (const [roleId, permissions] of grants) {
        const current = (await roles.get(roleId)) ?? builtInRole(roleId);
        const existing = new Set(current.grants.map((grant: Grant) => grant.permission));
        const additions = [...permissions]
            .filter((permission) => !existing.has(permission))
            .map((permission) => ({ permission }));
        if (additions.length) {
            await roles.upsert({ ...current, grants: [...current.grants, ...additions] });
        }
    }
}

function builtInRole(roleId: string): RoleDefinition {
    return { id: roleId, label: roleId === PUBLIC_ROLE ? "Public" : "User", builtin: true, grants: [] };
}
