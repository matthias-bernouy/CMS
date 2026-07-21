import { encryptAesGcm, decryptAesGcm, type EncryptedBlob } from "envelope-crypto/core/aesGcm";
import type { KekProvider } from "envelope-crypto/interfaces/KekProvider";
import type { SecretCrypto } from "envelope-crypto/interfaces/SecretCrypto";
import type { DekRepository } from "envelope-crypto/interfaces/DekRepository";

// Default cache TTL is generous (30 min) so a network-backed KekProvider
// (OVH OKMS, AWS KMS, …) doesn't pay a round-trip on every secret read.
// Trade-off: a hot DEK lives in process RAM for that long. Tune via
// `opts.ttlMs` per deployment.
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SIZE = 1000;

type CacheEntry = { dek: Buffer; expiresAt: number };

/**
 * `SecretCrypto` impl using envelope encryption: a `KekProvider` wraps
 * per-scope DEKs that live in a `DekRepository`. Plaintext DEKs cache
 * in-process with TTL+LRU to absorb hot reads without re-asking the KEK.
 *
 * On `encrypt`, missing DEKs are auto-created and persisted — callers
 * never provision DEK rows up front.
 *
 * `decrypt` throws when no DEK exists for the scope: the encrypted blob
 * references a key we no longer have, which is data loss the caller
 * must surface (not silently treat as empty).
 */
export class EnvelopeSecretCrypto implements SecretCrypto {
    private readonly _kekProvider: KekProvider;
    private readonly _dekRepo: DekRepository;
    private readonly _ttlMs: number;
    private readonly _maxSize: number;
    private readonly _cache: Map<string, CacheEntry> = new Map();
    private readonly _inflight: Map<string, Promise<Buffer>> = new Map();

    constructor(kekProvider: KekProvider, dekRepo: DekRepository, opts: { ttlMs?: number; maxSize?: number } = {}) {
        this._kekProvider = kekProvider;
        this._dekRepo = dekRepo;
        this._ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
        this._maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
    }

    async encrypt(scopeId: string, plaintext: string): Promise<EncryptedBlob> {
        const dek = await this._getOrCreateDek(scopeId);
        return encryptAesGcm(plaintext, dek);
    }

    async decrypt(scopeId: string, blob: EncryptedBlob): Promise<string> {
        const dek = await this._loadDek(scopeId);
        if (!dek) {
            throw new Error(`EnvelopeSecretCrypto: no DEK for scope "${scopeId}" — encrypted secrets cannot be read.`);
        }
        return decryptAesGcm(blob, dek).toString("utf8");
    }

    /**
     * Concurrency contract: at most one in-flight DEK resolution per
     * scope within this process — saves redundant KEK round-trips and
     * repo writes. Cross-process races are arbitrated by the repository
     * (`create` returns the winning record; see `_fetchOrCreate`).
     */
    private async _getOrCreateDek(scopeId: string): Promise<Buffer> {
        const cached = this._cacheHit(scopeId);
        if (cached) {
            return cached;
        }
        const inflight = this._inflight.get(scopeId);
        if (inflight) {
            return await inflight;
        }
        const promise = this._fetchOrCreate(scopeId);
        this._inflight.set(scopeId, promise);
        try {
            return await promise;
        } finally {
            this._inflight.delete(scopeId);
        }
    }

    private async _loadDek(scopeId: string): Promise<Buffer | null> {
        const cached = this._cacheHit(scopeId);
        if (cached) {
            return cached;
        }
        const row = await this._dekRepo.get(scopeId);
        if (!row) {
            return null;
        }
        const dek = await this._kekProvider.unwrap(row.wrapped);
        this._remember(scopeId, dek);
        return dek;
    }

    private async _fetchOrCreate(scopeId: string): Promise<Buffer> {
        const row = await this._dekRepo.get(scopeId);
        if (row) {
            const dek = await this._kekProvider.unwrap(row.wrapped);
            this._remember(scopeId, dek);
            return dek;
        }
        const { wrapped, plaintext } = await this._kekProvider.generateDek();
        const winner = await this._dekRepo.create({
            scopeId,
            wrapped,
            createdAt: new Date(),
            rotatedAt: null,
        });
        // Another PROCESS may have minted this scope's DEK between our `get`
        // and `create` — the in-flight map only serializes within one process.
        // The repository arbitrates; encrypting with the loser's DEK would
        // produce ciphertexts no one can ever read back.
        const dek = winner.wrapped === wrapped ? plaintext : await this._kekProvider.unwrap(winner.wrapped);
        this._remember(scopeId, dek);
        return dek;
    }

    private _cacheHit(scopeId: string): Buffer | null {
        const entry = this._cache.get(scopeId);
        if (!entry) {
            return null;
        }
        if (entry.expiresAt <= Date.now()) {
            this._cache.delete(scopeId);
            return null;
        }
        // LRU bump: re-insert so it moves to the end of the iteration order.
        this._cache.delete(scopeId);
        this._cache.set(scopeId, entry);
        return entry.dek;
    }

    private _remember(scopeId: string, dek: Buffer): void {
        if (this._cache.size >= this._maxSize) {
            const oldest = this._cache.keys().next().value;
            if (oldest !== undefined) {
                this._cache.delete(oldest);
            }
        }
        this._cache.set(scopeId, { dek, expiresAt: Date.now() + this._ttlMs });
    }
}
