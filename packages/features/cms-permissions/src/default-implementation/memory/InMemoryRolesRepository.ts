import type { RoleDefinition } from "cms-permissions/core/permissions";
import { defaultRoleDefinitions } from "cms-permissions/core/permissions";
import type { RolesRepository } from "cms-permissions/interfaces/RolesRepository";

/**
 * In-memory `RolesRepository`, seeded with the editable built-ins
 * (`user`, `public`). Adequate for dev / tests / single-process. Custom
 * roles live only for the process lifetime.
 */
export class InMemoryRolesRepository implements RolesRepository {
    private readonly _defs = new Map<string, RoleDefinition>();

    constructor() {
        for (const d of defaultRoleDefinitions()) {
            this._defs.set(d.id, copy(d));
        }
    }

    async list(): Promise<RoleDefinition[]> {
        return [...this._defs.values()].map(copy);
    }

    async get(id: string): Promise<RoleDefinition | null> {
        const d = this._defs.get(id);
        return d ? copy(d) : null;
    }

    async upsert(def: RoleDefinition): Promise<void> {
        this._defs.set(def.id, copy(def));
    }

    async delete(id: string): Promise<void> {
        this._defs.delete(id);
    }
}

/** Defensive copy — grants is copied too, so a caller mutating a returned
 *  role never reaches the stored one. */
const copy = (d: RoleDefinition): RoleDefinition => ({ ...d, grants: d.grants.map((g) => ({ ...g })) });
