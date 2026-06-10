import { ADMIN_ROLE, type Grant, type RoleDefinition } from "@bernouy/cms-permissions";
import type { CmsRepository } from "cms-content/interfaces/CmsRepository";
import { ContentValidationError, ContentConflictError } from "cms-content/core/errors";

/** Role id format: starts with a letter, then 1-31 of [a-z0-9_-]. */
const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export type RoleDto = { id: string; label: string; grants: Grant[] };

/** Minimal reader for the "role still assigned?" guard — `UsersRepository`
 *  satisfies it structurally. */
export type RoleHolderCounter = {
    list(opts: { role: string }): Promise<{ total: number }>;
};

/**
 * Create or update a role definition. `admin` is the virtual super-role and is
 * rejected (never stored). Built-in roles (`user`, `public`) keep their
 * id/label/builtin flag — only their grants are updated; custom roles update
 * both label and grants. Persists via a narrow `updateSystem` write (no page
 * cache flush, unlike the settings endpoint).
 */
export async function upsertRole(repository: CmsRepository, dto: RoleDto): Promise<RoleDefinition> {
    if (dto.id === ADMIN_ROLE) {
        throw new ContentValidationError("id", "the admin super-role is built-in and cannot be edited");
    }

    const system = await repository.getSystem();
    const defs   = system.roles.definitions.map((d) => ({ ...d }));
    const existing = defs.find((d) => d.id === dto.id);

    let saved: RoleDefinition;
    if (existing) {
        existing.grants = dto.grants;
        if (!existing.builtin) existing.label = dto.label;   // built-in labels are fixed
        saved = existing;
    } else {
        if (!ID_RE.test(dto.id)) {
            throw new ContentValidationError("id", "use 2-32 chars: a-z, 0-9, -, _ (start with a letter)");
        }
        saved = { id: dto.id, label: dto.label, grants: dto.grants };
        defs.push(saved);
    }

    await repository.updateSystem({ roles: { definitions: defs } });
    return saved;
}

/**
 * Delete a custom role. Refuses the virtual `admin`, built-in roles, unknown
 * ids, and roles still assigned to users (409 — reassign first, so nobody is
 * left holding a vanished role).
 */
export async function deleteRole(repository: CmsRepository, users: RoleHolderCounter, id: string): Promise<void> {
    if (id === ADMIN_ROLE) throw new ContentValidationError("id", "the admin super-role cannot be deleted");

    const system = await repository.getSystem();
    const def = system.roles.definitions.find((d) => d.id === id);
    if (!def)        throw new ContentValidationError("id", "unknown role");
    if (def.builtin) throw new ContentValidationError("id", "built-in roles cannot be deleted");

    const holders = await users.list({ role: id });
    if (holders.total > 0) {
        throw new ContentConflictError(`Role "${id}" is still assigned to ${holders.total} user(s); reassign them first.`);
    }

    const defs = system.roles.definitions.filter((d) => d.id !== id);
    await repository.updateSystem({ roles: { definitions: defs } });
}
