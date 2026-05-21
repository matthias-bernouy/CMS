import type { KeyStore } from "src/interfaces/KeyStore";
import type { SigningKey, PublishedKey } from "src/types/SigningKey";
import { generateSigningKey, type GeneratedKey } from "src/core/keys/generate";
import { isPrunable } from "src/core/keys/rotation";

interface Entry extends GeneratedKey { retiredAt?: number }

/**
 * Default `KeyStore` for tests — in-memory. Lazily creates the first key.
 * Rotation is **publish-before-sign**: `rotate()` adds the new key (it
 * appears in `loadAll()` → JWKS) and only the newest non-retired key is
 * `loadActive()`'d for signing; retired keys stay published until `prune()`
 * past the overlap. Clock injected for deterministic tests.
 */
export class MemoryKeyStore implements KeyStore {
    private keys: Entry[] = [];

    constructor(private readonly opts: { now: () => number; keyOverlapSeconds: number }) {}

    private async ensure(): Promise<void> {
        if (!this.keys.some((k) => k.retiredAt === undefined)) {
            this.keys.push(await generateSigningKey(this.opts.now()));
        }
    }

    async loadActive(): Promise<SigningKey> {
        await this.ensure();
        const a = [...this.keys].reverse().find((k) => k.retiredAt === undefined)!;
        return { kid: a.kid, privateKey: a.privateKey, publicJwk: a.publicJwk };
    }

    async loadAll(): Promise<PublishedKey[]> {
        await this.ensure();
        await this.prune(this.opts.now());
        return this.keys.map((k) => ({
            kid: k.kid, publicJwk: k.publicJwk, createdAt: k.createdAt,
            ...(k.retiredAt !== undefined ? { retiredAt: k.retiredAt } : {}),
        }));
    }

    async rotate(): Promise<void> {
        await this.ensure();
        const now = this.opts.now();
        for (const k of this.keys) if (k.retiredAt === undefined) k.retiredAt = now;
        this.keys.push(await generateSigningKey(now));
    }

    async prune(nowSec: number): Promise<void> {
        this.keys = this.keys.filter((k) => !isPrunable(k, nowSec, this.opts.keyOverlapSeconds));
    }
}
