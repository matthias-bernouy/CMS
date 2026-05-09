import { randomBytes } from "node:crypto";

import type { SecretCrypto } from "../core/crypto/SecretCrypto";
import { encryptAesGcm, decryptAesGcm, type EncryptedBlob } from "../core/crypto/encrypt";
import type { BucketDekRepository } from "../interfaces/repositories/BucketDekRepository";

const DEK_BYTES        = 32;
const DEFAULT_TTL_MS   = 5 * 60 * 1000;
const DEFAULT_MAX_SIZE = 1000;

type CacheEntry = { dek: Buffer; expiresAt: number };

/**
 * Default `SecretCrypto` — envelope encryption with the process KEK
 * unwrapping per-bucket DEKs lazily. Plaintext DEKs live in a small LRU
 * (TTL-expiring) so that a hot bucket doesn't repeat the KEK round-trip
 * on every secret read.
 *
 * On `encryptForBucket`, missing DEKs are auto-created and persisted —
 * callers do not need to provision a bucket-DEK row up front.
 *
 * `decryptForBucket` throws when no DEK exists for the bucket: that
 * means the encrypted blob references a key we no longer have, which
 * is data loss the caller must surface (not silently treat as empty).
 */
export class EnvelopeSecretCrypto implements SecretCrypto {

    private readonly _kek:     Buffer;
    private readonly _dekRepo: BucketDekRepository;
    private readonly _ttlMs:   number;
    private readonly _maxSize: number;
    private readonly _cache:   Map<string, CacheEntry> = new Map();
    private readonly _inflight: Map<string, Promise<Buffer | null>> = new Map();

    constructor(kek: Buffer, dekRepo: BucketDekRepository, opts: { ttlMs?: number; maxSize?: number } = {}) {
        if (kek.length !== DEK_BYTES) {
            throw new Error(`EnvelopeSecretCrypto: KEK must be ${DEK_BYTES} bytes, got ${kek.length}.`);
        }
        this._kek     = kek;
        this._dekRepo = dekRepo;
        this._ttlMs   = opts.ttlMs   ?? DEFAULT_TTL_MS;
        this._maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
    }

    async encryptForBucket(bucketId: string, plaintext: string): Promise<EncryptedBlob> {
        const dek = await this._getOrCreateDek(bucketId);
        return encryptAesGcm(plaintext, dek);
    }

    async decryptForBucket(bucketId: string, blob: EncryptedBlob): Promise<string> {
        const dek = await this._loadDek(bucketId);
        if (!dek) throw new Error(`EnvelopeSecretCrypto: no DEK for bucket "${bucketId}" — encrypted secrets cannot be read.`);
        return decryptAesGcm(blob, dek).toString("utf8");
    }

    /**
     * Concurrency contract: at most one in-flight DEK resolution per
     * bucket. This is what makes "concurrent encryptForBucket on a fresh
     * bucket creates a single DEK" hold — without it three parallel
     * encrypts each see no row, each generate + upsert their own key,
     * and the last write silently invalidates the first two ciphertexts.
     */
    private async _getOrCreateDek(bucketId: string): Promise<Buffer> {
        const cached = this._cacheHit(bucketId);
        if (cached) return cached;
        const inflight = this._inflight.get(bucketId);
        if (inflight) {
            const dek = await inflight;
            if (dek) return dek;
        }
        const promise: Promise<Buffer | null> = this._fetchOrCreate(bucketId);
        this._inflight.set(bucketId, promise);
        try {
            const dek = await promise;
            if (!dek) throw new Error("EnvelopeSecretCrypto: DEK creation returned null.");
            return dek;
        } finally {
            this._inflight.delete(bucketId);
        }
    }

    private async _loadDek(bucketId: string): Promise<Buffer | null> {
        const cached = this._cacheHit(bucketId);
        if (cached) return cached;
        const row = await this._dekRepo.get(bucketId);
        if (!row) return null;
        const dek = decryptAesGcm({ ciphertext: row.encryptedDek, iv: row.iv }, this._kek);
        this._remember(bucketId, dek);
        return dek;
    }

    private async _fetchOrCreate(bucketId: string): Promise<Buffer> {
        const row = await this._dekRepo.get(bucketId);
        if (row) {
            const dek = decryptAesGcm({ ciphertext: row.encryptedDek, iv: row.iv }, this._kek);
            this._remember(bucketId, dek);
            return dek;
        }
        const dek = randomBytes(DEK_BYTES);
        const wrapped = encryptAesGcm(dek, this._kek);
        await this._dekRepo.upsert({
            bucketId,
            encryptedDek: wrapped.ciphertext,
            iv:           wrapped.iv,
            createdAt:    new Date(),
            rotatedAt:    null,
        });
        this._remember(bucketId, dek);
        return dek;
    }

    private _cacheHit(bucketId: string): Buffer | null {
        const entry = this._cache.get(bucketId);
        if (!entry || entry.expiresAt <= Date.now()) return null;
        this._cache.delete(bucketId);
        this._cache.set(bucketId, entry);
        return entry.dek;
    }

    private _remember(bucketId: string, dek: Buffer): void {
        if (this._cache.size >= this._maxSize) {
            const oldest = this._cache.keys().next().value;
            if (oldest !== undefined) this._cache.delete(oldest);
        }
        this._cache.set(bucketId, { dek, expiresAt: Date.now() + this._ttlMs });
    }
}
