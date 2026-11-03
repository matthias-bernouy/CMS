import { randomUUIDv7 } from "bun";
import type {
    PatRepository,
    Pat,
    PatPrincipal,
    NewPat,
} from "cms-auth/tokens/personal-access/interfaces/PatRepository";
import { mintPatToken, hashPatToken } from "cms-auth/tokens/personal-access/core/patToken";
import { MAX_PERSONAL_ACCESS_TOKENS, PersonalAccessTokenLimitError } from "cms-auth/tokens/personal-access/core/limits";

/**
 * In-memory `PatRepository` for dev and tests. Stores only the SHA-256 of each
 * token (never the plaintext), keyed both by record id and by hash so `verify`
 * is a single lookup. Mirrors the semantics a Mongo impl would have (the hash
 * column is the unique lookup key).
 */
export class InMemoryPatRepository implements PatRepository {
    private readonly subjects = new Map<string, Map<string, { pat: Pat; hash: string }>>();
    private readonly hashes = new Map<string, { pat: Pat; hash: string }>();

    async create(input: NewPat): Promise<{ token: string; pat: Pat }> {
        const records = this.subjects.get(input.sub) ?? new Map<string, { pat: Pat; hash: string }>();
        if (records.size >= MAX_PERSONAL_ACCESS_TOKENS) {
            throw new PersonalAccessTokenLimitError();
        }
        const token = mintPatToken();
        const pat: Pat = {
            id: randomUUIDv7(),
            sub: input.sub,
            name: input.name,
            createdAt: new Date(),
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        };
        const record = { pat, hash: hashPatToken(token) };
        records.set(pat.id, record);
        this.subjects.set(input.sub, records);
        this.hashes.set(record.hash, record);
        return { token, pat: structuredClone(pat) };
    }

    async verify(token: string): Promise<PatPrincipal | null> {
        const pat = this.hashes.get(hashPatToken(token))?.pat;
        if (!pat) {
            return null;
        }
        if (pat.expiresAt && pat.expiresAt.getTime() <= Date.now()) {
            return null;
        }
        pat.lastUsedAt = new Date();
        return { sub: pat.sub };
    }

    async list(sub: string): Promise<Pat[]> {
        return [...(this.subjects.get(sub)?.values() ?? [])].map(({ pat }) => structuredClone(pat));
    }

    async revoke(sub: string, id: string): Promise<boolean> {
        const records = this.subjects.get(sub);
        const record = records?.get(id);
        if (!records || !record) {
            return false;
        }
        records.delete(id);
        this.hashes.delete(record.hash);
        if (!records.size) {
            this.subjects.delete(sub);
        }
        return true;
    }
}
