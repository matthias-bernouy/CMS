import type { RoleDefinition } from "cms-permissions/core/permissions";

/**
 * Persistence contract for manager-defined role definitions. `id` is the
 * primary key. The two built-ins (`user`, `public`) are seeded by every
 * implementation and kept non-deletable by the mutation rules; the virtual
 * `admin` super-role is NEVER stored here.
 *
 * Implementations own their seeding: a fresh store already lists the
 * built-ins, so callers never special-case an empty store.
 */
export interface RolesRepository {
    list(): Promise<RoleDefinition[]>;
    get(id: string): Promise<RoleDefinition | null>;
    upsert(def: RoleDefinition): Promise<void>;
    delete(id: string): Promise<void>;
}

/**
 * Minimal reader for the "role still assigned?" guard — a `UsersRepository`
 * satisfies it structurally. Kept here so `deleteRole` doesn't depend on the
 * auth package.
 */
export type RoleHolderCounter = {
    list(opts: { role: string }): Promise<{ total: number }>;
};
