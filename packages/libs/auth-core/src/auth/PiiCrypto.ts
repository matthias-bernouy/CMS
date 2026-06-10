import { createHmac, randomBytes } from "node:crypto";
import type { Collection, Db } from "mongodb";
import type { EncryptedBlob, SecretCrypto } from "@bernouy/core";

/**
 * Per-tenant PII protection for the Mongo stores. Two concerns:
 *
 *  - **Confidentiality** — `encrypt`/`decrypt` route through the tenant DEK
 *    (`SecretCrypto`, scopeId = tenantId, KEK-wrapped). Non-deterministic, so
 *    a DB dump never reveals an email/displayName in clear.
 *  - **Lookup** — `blindIndex(value)` is a DETERMINISTIC keyed digest
 *    (HMAC-SHA256 over the normalized value) stored alongside the ciphertext.
 *    It enables exact-match queries + uniqueness on encrypted fields.
 *    **Exact match only** (Option A) — no substring, no sort on encrypted
 *    fields.
 *
 * The HMAC index key is per-tenant, generated once and persisted **encrypted**
 * (via the same DEK) in a `<prefix>system_keys` doc — never in plaintext at
 * rest, and never in the user-facing SecretStore. Build via `createPiiCrypto`.
 */
export class PiiCrypto {
    constructor(
        private readonly scopeId:  string,
        private readonly crypto:   SecretCrypto,
        private readonly indexKey: Buffer,
    ) {}

    encrypt(plaintext: string): Promise<EncryptedBlob> {
        return this.crypto.encrypt(this.scopeId, plaintext);
    }

    decrypt(blob: EncryptedBlob): Promise<string> {
        // Normalize Mongo BSON `Binary` back to Buffer for the AES-GCM layer.
        return this.crypto.decrypt(this.scopeId, { ciphertext: asBuffer(blob.ciphertext), iv: asBuffer(blob.iv) });
    }

    /** Deterministic keyed digest. Normalizes (trim + lowercase) so lookups are
     *  case/space-insensitive and consistent with what gets encrypted. */
    blindIndex(value: string): string {
        return createHmac("sha256", this.indexKey).update(value.trim().toLowerCase()).digest("hex");
    }
}

/** Mongo returns stored Buffers as BSON `Binary`; normalize back to Buffer. */
function asBuffer(v: Buffer | { buffer: Buffer }): Buffer {
    return Buffer.isBuffer(v) ? v : Buffer.from(v.buffer);
}

type SystemKeyDoc = { _id: string; ciphertext: Buffer; iv: Buffer };
const PII_INDEX_KEY = "pii_index";

/**
 * Load (or generate + persist) the per-tenant blind-index key, then build a
 * `PiiCrypto`. The key is stored encrypted under the tenant DEK in
 * `<prefix>system_keys` — out of the user-facing SecretStore.
 */
export async function createPiiCrypto(
    scopeId: string,
    crypto: SecretCrypto,
    db: Db,
    collectionPrefix = "",
): Promise<PiiCrypto> {
    const col: Collection<SystemKeyDoc> = db.collection<SystemKeyDoc>(collectionPrefix + "system_keys");

    const existing = await col.findOne({ _id: PII_INDEX_KEY });
    if (existing) {
        const hex = await crypto.decrypt(scopeId, { ciphertext: asBuffer(existing.ciphertext), iv: asBuffer(existing.iv) });
        return new PiiCrypto(scopeId, crypto, Buffer.from(hex, "hex"));
    }

    const hex  = randomBytes(32).toString("hex");
    const blob = await crypto.encrypt(scopeId, hex);
    try {
        await col.insertOne({ _id: PII_INDEX_KEY, ciphertext: blob.ciphertext, iv: blob.iv });
    } catch (e) {
        // Lost a creation race — re-read the winner's key.
        if (e && typeof e === "object" && (e as { code?: number }).code === 11000) {
            const winner = await col.findOne({ _id: PII_INDEX_KEY });
            if (winner) {
                const hx = await crypto.decrypt(scopeId, { ciphertext: winner.ciphertext, iv: winner.iv });
                return new PiiCrypto(scopeId, crypto, Buffer.from(hx, "hex"));
            }
        }
        throw e;
    }
    return new PiiCrypto(scopeId, crypto, Buffer.from(hex, "hex"));
}
