import type { DefaultRole } from "@bernouy/core";
import type { ApiToken, ApiTokenRepository } from "../src/interfaces/ApiTokenRepository";

/**
 * Zero-dependency `ApiTokenRepository` backed by an in-process `Map`.
 * Suitable for tests and demos; NOT for production (state is lost on restart
 * and not shared across processes).
 */
export class InMemoryApiTokenRepository<Role extends string = DefaultRole>
    implements ApiTokenRepository<Role> {

    private readonly _byId = new Map<string, ApiToken<Role>>();
    private readonly _hashIndex = new Map<string, string>();

    async findByHash(hash: string): Promise<ApiToken<Role> | null> {
        const id = this._hashIndex.get(hash);
        if (!id) return null;
        return this._byId.get(id) ?? null;
    }

    async findByOwner(sub: string): Promise<ApiToken<Role>[]> {
        return [...this._byId.values()]
            .filter((t) => t.ownerSub === sub)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    async countActiveByOwner(sub: string): Promise<number> {
        const now = Date.now();
        let count = 0;
        for (const t of this._byId.values()) {
            if (t.ownerSub !== sub) continue;
            if (t.revokedAt) continue;
            if (t.expiresAt && t.expiresAt.getTime() <= now) continue;
            count++;
        }
        return count;
    }

    async create(data: Omit<ApiToken<Role>, "id" | "createdAt">): Promise<ApiToken<Role>> {
        const token: ApiToken<Role> = {
            ...data,
            id: crypto.randomUUID(),
            createdAt: new Date(),
        };
        this._byId.set(token.id, token);
        this._hashIndex.set(token.tokenHash, token.id);
        return token;
    }

    async revoke(id: string, ownerSub: string): Promise<boolean> {
        const token = this._byId.get(id);
        if (!token) return false;
        if (token.ownerSub !== ownerSub) return false;
        if (token.revokedAt) return false;
        this._byId.set(id, { ...token, revokedAt: new Date() });
        return true;
    }

    async touchLastUsed(id: string): Promise<void> {
        const token = this._byId.get(id);
        if (!token) return;
        this._byId.set(id, { ...token, lastUsedAt: new Date() });
    }
}
