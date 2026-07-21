import type { RolesRepository } from "cms-permissions/interfaces/RolesRepository";
import type { RoleDefinition } from "cms-permissions/core/permissions";
import { ADMIN_ROLE, PUBLIC_ROLE, USER_ROLE } from "cms-permissions/core/permissions";
import { ROLE_ID_RE, validateGrants } from "cms-permissions/core/mutateRole";
import { RoleValidationError } from "cms-permissions/core/errors";

/**
 * Decorator that enforces the role invariants on every write before delegating —
 * the unbypassable barrier so no writer can store the virtual `admin`, a
 * malformed id, or an out-of-catalogue CMS grant, nor delete a built-in.
 * `upsertRole`/`deleteRole` (the rich mutation API with read-modify-write
 * policy and referential guards) remain the intended entry points; this seam
 * catches direct `upsert`/`delete` callers. Reads pass straight through.
 *
 *   `new ValidatingRolesRepository(new MongoRolesRepository(collection))`
 */
export class ValidatingRolesRepository implements RolesRepository {
    constructor(private readonly inner: RolesRepository) {}

    async upsert(def: RoleDefinition): Promise<void> {
        if (def.id === ADMIN_ROLE) {
            throw new RoleValidationError("id", "the admin super-role is built-in and cannot be edited");
        }
        if (!ROLE_ID_RE.test(def.id)) {
            throw new RoleValidationError("id", "use 2-32 chars: a-z, 0-9, -, _ (start with a letter)");
        }
        validateGrants(def.grants);
        return this.inner.upsert(normalizeBuiltIn(def));
    }

    async delete(id: string): Promise<void> {
        if (id === ADMIN_ROLE) {
            throw new RoleValidationError("id", "the admin super-role cannot be deleted");
        }
        if (id === USER_ROLE || id === PUBLIC_ROLE) {
            throw new RoleValidationError("id", "built-in roles cannot be deleted");
        }
        const def = await this.inner.get(id);
        if (def?.builtin) {
            throw new RoleValidationError("id", "built-in roles cannot be deleted");
        }
        return this.inner.delete(id);
    }

    list() {
        return this.inner.list();
    }
    get(id: string) {
        return this.inner.get(id);
    }
}

function normalizeBuiltIn(def: RoleDefinition): RoleDefinition {
    if (def.id === USER_ROLE) {
        return { ...def, label: "User", builtin: true };
    }
    if (def.id === PUBLIC_ROLE) {
        return { ...def, label: "Public", builtin: true };
    }
    return def;
}
