import { randomUUIDv7 } from "bun";
import type { PatRepository, Pat, PatPrincipal, NewPat } from "src/socle/interfaces/PatRepository";
import { mintPatToken, hashPatToken } from "src/socle/auth/patToken";

/**
 * In-memory `PatRepository` for dev and tests. Stores only the SHA-256 of each
 * token (never the plaintext), keyed both by record id and by hash so `verify`
 * is a single lookup. Mirrors the semantics a Mongo impl would have (the hash
 * column is the unique lookup key).
 */
export class InMemoryPatRepository implements PatRepository {

    private _byId     = new Map<string, Pat>();
    private _idByHash = new Map<string, string>();

    async create(input: NewPat): Promise<{ token: string; pat: Pat }> {
        const token = mintPatToken();
        const pat: Pat = {
            id:        randomUUIDv7(),
            sub:       input.sub,
            name:      input.name,
            scopes:    input.scopes ?? [],
            createdAt: new Date(),
            expiresAt: input.expiresAt ?? null,
        };
        this._byId.set(pat.id, pat);
        this._idByHash.set(hashPatToken(token), pat.id);
        return { token, pat: { ...pat } };
    }

    async verify(token: string): Promise<PatPrincipal | null> {
        const id = this._idByHash.get(hashPatToken(token));
        const pat = id ? this._byId.get(id) : undefined;
        if (!pat) return null;
        if (pat.expiresAt && pat.expiresAt.getTime() <= Date.now()) return null;
        pat.lastUsedAt = new Date();
        return { sub: pat.sub, scopes: [...pat.scopes] };
    }

    async list(sub: string): Promise<Pat[]> {
        return [...this._byId.values()].filter(p => p.sub === sub).map(p => ({ ...p }));
    }

    async revoke(id: string): Promise<boolean> {
        if (!this._byId.delete(id)) return false;
        for (const [h, pid] of this._idByHash) if (pid === id) this._idByHash.delete(h);
        return true;
    }
}
