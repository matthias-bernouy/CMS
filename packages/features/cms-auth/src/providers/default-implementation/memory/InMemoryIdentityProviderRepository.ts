import type {
    IdentityProviderRepository,
    IdentityProvider,
    NewIdentityProvider,
    IdentityProviderPatch,
} from "cms-auth/providers/interfaces/IdentityProvider";

/**
 * In-memory `IdentityProviderRepository` for dev and tests. `id` is the unique
 * key (supplied by the caller — typically a slug like `"google"` / `"local"`).
 * Reads return shallow copies. Secrets are NOT held here (see the interface).
 */
export class InMemoryIdentityProviderRepository implements IdentityProviderRepository {
    private _byId = new Map<string, IdentityProvider>();

    async list(): Promise<IdentityProvider[]> {
        return [...this._byId.values()].map(clone);
    }

    async get(id: string): Promise<IdentityProvider | null> {
        const p = this._byId.get(id);
        return p ? clone(p) : null;
    }

    async create(input: NewIdentityProvider): Promise<IdentityProvider> {
        if (this._byId.has(input.id)) {
            throw new Error(`identity provider "${input.id}" already exists`);
        }
        const now = new Date();
        const provider: IdentityProvider = { ...input, revision: 1, createdAt: now, updatedAt: now };
        this._byId.set(provider.id, provider);
        return clone(provider);
    }

    async update(
        id: string,
        patch: IdentityProviderPatch,
        expectedRevision?: number,
    ): Promise<IdentityProvider | null> {
        const cur = this._byId.get(id);
        if (!cur) {
            return null;
        }
        assertRevision(cur.revision, expectedRevision);
        const next: IdentityProvider = {
            ...cur,
            ...patch,
            id: cur.id,
            revision: cur.revision + 1,
            createdAt: cur.createdAt,
            updatedAt: new Date(),
        };
        this._byId.set(id, next);
        return clone(next);
    }

    async delete(id: string, expectedRevision?: number): Promise<boolean> {
        const current = this._byId.get(id);
        if (!current) {
            return false;
        }
        assertRevision(current.revision, expectedRevision);
        return this._byId.delete(id);
    }
}

const clone = (p: IdentityProvider): IdentityProvider => ({ ...p });

function assertRevision(actual: number, expected: number | undefined): void {
    if (expected !== undefined && actual !== expected) {
        throw Object.assign(new Error("identity provider revision conflict"), { status: 409 });
    }
}
