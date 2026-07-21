import type {
    UsersRepository,
    Identity,
    TUser,
    UsersListOptions,
    UsersPage,
} from "cms-auth/interfaces/UsersRepository";

/**
 * In-memory `UsersRepository` for local dev and tests. No persistence. Mirrors
 * `MongoUsersRepository` semantics so swapping providers is transparent:
 * `upsert` preserves the role AND only overwrites fields the identity actually
 * carries; `list` does an EXACT email match + sorts by `createdAt`/`lastSeenAt`
 * (encrypted PII can't be substring-searched or sorted in the Mongo impl).
 * Reads return shallow copies so callers can't mutate stored rows.
 */
export class InMemoryUsersRepository<Role extends string = string> implements UsersRepository<Role> {
    private _users = new Map<string, TUser<Role>>(); // by sub

    async upsert(identity: Identity, defaultRole: Role): Promise<TUser<Role>> {
        const now = new Date();
        const cur = this._users.get(identity.sub);
        if (!cur) {
            const created: TUser<Role> = { ...identity, role: defaultRole, createdAt: now, lastSeenAt: now };
            this._users.set(identity.sub, created);
            return clone(created);
        }
        // Only update fields the identity actually carries — a re-login without
        // an email must not wipe the stored one (mirrors Mongo's
        // `$set`-only-provided behavior).
        const next: TUser<Role> = { ...cur, lastSeenAt: now };
        if (identity.email !== undefined) {
            next.email = identity.email;
        }
        if (identity.provider !== undefined) {
            next.provider = identity.provider;
        }
        this._users.set(identity.sub, next);
        return clone(next);
    }

    async getBySub(sub: string): Promise<TUser<Role> | null> {
        const u = this._users.get(sub);
        return u ? clone(u) : null;
    }

    async setRole(sub: string, role: Role): Promise<TUser<Role> | null> {
        const u = this._users.get(sub);
        if (!u) {
            return null;
        }
        const next = { ...u, role };
        this._users.set(sub, next);
        return clone(next);
    }

    async delete(sub: string): Promise<boolean> {
        return this._users.delete(sub);
    }

    async list(opts: UsersListOptions = {}): Promise<UsersPage<Role>> {
        let rows = [...this._users.values()];
        if (opts.role) {
            rows = rows.filter((u) => u.role === opts.role);
        }
        if (opts.search) {
            const q = opts.search.trim().toLowerCase(); // exact email match (parity with Mongo blind index)
            rows = rows.filter((u) => (u.email ?? "").toLowerCase() === q);
        }

        const by = opts.sortBy ?? "createdAt";
        const dir = opts.sortOrder === "desc" ? -1 : 1;
        rows.sort((a, b) => (a[by].getTime() - b[by].getTime()) * dir);

        const total = rows.length;
        const limit = opts.pagination?.limit ?? total;
        const page = opts.pagination?.page ?? 1;
        const start = opts.pagination ? (page - 1) * limit : 0;
        const slice = opts.pagination ? rows.slice(start, start + limit) : rows;
        return { users: slice.map(clone), total, page, limit, hasMore: start + slice.length < total };
    }
}

const clone = <Role extends string>(u: TUser<Role>): TUser<Role> => ({ ...u });
