import type { ControlCms } from "cms-control/ControlCms";
import { ADMIN_ROLE, CMS_PERMISSIONS, type Grant, type RoleDefinition } from "@bernouy/cms-permissions";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import HttpError from "cms-control/errors/Http/HttpError";

/** Role id format: starts with a letter, then 1-31 of [a-z0-9_-]. */
const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export type RoleDto = { id: string; label: string; grants: Grant[] };

/** Parse + validate a `POST /api/roles` body into a `RoleDto`. */
export function parseRoleDto(body: Record<string, unknown>): RoleDto {
    const id    = typeof body.id    === "string" ? body.id.trim()    : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!id)    throw new InvalidParam("id", "required");
    if (!label) throw new InvalidParam("label", "required");
    return { id, label, grants: parseGrants(body.grants) };
}

/** Validate the optional `grants` payload. CMS-namespaced permissions
 *  (`urn:cms:*`) must exist in the catalogue; other ids (gateway endpoint urns)
 *  are accepted as-is. `condition` is reserved (V1) and dropped. */
function parseGrants(raw: unknown): Grant[] {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw new InvalidParam("grants", "array expected");
    return raw.map((g) => {
        const permission = g && typeof g === "object" && typeof (g as { permission?: unknown }).permission === "string"
            ? (g as { permission: string }).permission.trim()
            : "";
        if (!permission) throw new InvalidParam("grants", "each grant needs a permission");
        if (permission.startsWith("urn:cms:") && !CMS_PERMISSIONS.includes(permission)) {
            throw new InvalidParam("grants", `unknown CMS permission ${permission}`);
        }
        return { permission };
    });
}

/**
 * Create or update a role definition. `admin` is the virtual super-role and is
 * rejected (never stored). Built-in roles (`user`, `public`) keep their
 * id/label/builtin flag — only their grants are updated; custom roles update
 * both label and grants. Persists via a narrow `updateSystem` write (no page
 * cache flush, unlike the settings endpoint).
 */
export async function upsertRole(cms: ControlCms, dto: RoleDto): Promise<RoleDefinition> {
    if (dto.id === ADMIN_ROLE) {
        throw new InvalidParam("id", "the admin super-role is built-in and cannot be edited");
    }

    const system = await cms.repository.getSystem();
    const defs   = system.roles.definitions.map((d) => ({ ...d }));
    const existing = defs.find((d) => d.id === dto.id);

    let saved: RoleDefinition;
    if (existing) {
        existing.grants = dto.grants;
        if (!existing.builtin) existing.label = dto.label;   // built-in labels are fixed
        saved = existing;
    } else {
        if (!ID_RE.test(dto.id)) {
            throw new InvalidParam("id", "use 2-32 chars: a-z, 0-9, -, _ (start with a letter)");
        }
        saved = { id: dto.id, label: dto.label, grants: dto.grants };
        defs.push(saved);
    }

    await cms.repository.updateSystem({ roles: { definitions: defs } });
    return saved;
}

/**
 * Delete a custom role. Refuses the virtual `admin`, built-in roles, unknown
 * ids, and roles still assigned to users (409 — reassign first, so nobody is
 * left holding a vanished role).
 */
export async function deleteRole(cms: ControlCms, id: string): Promise<void> {
    if (id === ADMIN_ROLE) throw new InvalidParam("id", "the admin super-role cannot be deleted");

    const system = await cms.repository.getSystem();
    const def = system.roles.definitions.find((d) => d.id === id);
    if (!def)        throw new InvalidParam("id", "unknown role");
    if (def.builtin) throw new InvalidParam("id", "built-in roles cannot be deleted");

    const holders = await cms.users.list({ role: id });
    if (holders.total > 0) {
        throw new HttpError(409, `Role "${id}" is still assigned to ${holders.total} user(s); reassign them first.`);
    }

    const defs = system.roles.definitions.filter((d) => d.id !== id);
    await cms.repository.updateSystem({ roles: { definitions: defs } });
}
