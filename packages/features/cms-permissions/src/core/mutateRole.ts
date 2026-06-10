import { ADMIN_ROLE, CMS_PERMISSIONS, type Grant, type RoleDefinition } from "cms-permissions/core/permissions";
import type { RolesRepository, RoleHolderCounter } from "cms-permissions/interfaces/RolesRepository";
import { RoleValidationError, RoleConflictError } from "cms-permissions/core/errors";

/** Role id format: starts with a letter, then 1-31 of [a-z0-9_-]. */
const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export type RoleDto = { id: string; label: string; grants: Grant[] };

/** Grants rule: CMS-namespaced permissions (`urn:cms:*`) must exist in the
 *  catalogue; other ids (gateway endpoint urns) are accepted as-is. */
function validateGrants(grants: Grant[]): void {
    for (const g of grants) {
        if (g.permission.startsWith("urn:cms:") && !CMS_PERMISSIONS.includes(g.permission)) {
            throw new RoleValidationError("grants", `unknown CMS permission ${g.permission}`);
        }
    }
}

/**
 * Create or update a role definition. `admin` is the virtual super-role and is
 * rejected (never stored). Built-in roles (`user`, `public`) keep their
 * id/label/builtin flag — only their grants are updated; custom roles update
 * both label and grants.
 */
export async function upsertRole(roles: RolesRepository, dto: RoleDto): Promise<RoleDefinition> {
    if (dto.id === ADMIN_ROLE) {
        throw new RoleValidationError("id", "the admin super-role is built-in and cannot be edited");
    }
    validateGrants(dto.grants);

    const existing = await roles.get(dto.id);
    let saved: RoleDefinition;
    if (existing) {
        saved = {
            ...existing,
            grants: dto.grants,
            ...(existing.builtin ? {} : { label: dto.label }),   // built-in labels are fixed
        };
    } else {
        if (!ID_RE.test(dto.id)) {
            throw new RoleValidationError("id", "use 2-32 chars: a-z, 0-9, -, _ (start with a letter)");
        }
        saved = { id: dto.id, label: dto.label, grants: dto.grants };
    }

    await roles.upsert(saved);
    return saved;
}

/**
 * Delete a custom role. Refuses the virtual `admin`, built-in roles, unknown
 * ids, and roles still assigned to users (409 — reassign first, so nobody is
 * left holding a vanished role).
 */
export async function deleteRole(roles: RolesRepository, users: RoleHolderCounter, id: string): Promise<void> {
    if (id === ADMIN_ROLE) throw new RoleValidationError("id", "the admin super-role cannot be deleted");

    const def = await roles.get(id);
    if (!def)        throw new RoleValidationError("id", "unknown role");
    if (def.builtin) throw new RoleValidationError("id", "built-in roles cannot be deleted");

    const holders = await users.list({ role: id });
    if (holders.total > 0) {
        throw new RoleConflictError(`Role "${id}" is still assigned to ${holders.total} user(s); reassign them first.`);
    }

    await roles.delete(id);
}
