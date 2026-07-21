import { createHmac, randomBytes } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { asBuffer } from "envelope-crypto/core/buffer";
import type { EncryptedBlob } from "envelope-crypto/core/aesGcm";
import type { SecretCrypto } from "envelope-crypto/interfaces/SecretCrypto";

/**
 * Queryable field encryption, scoped per tenant. Two concerns:
 *
 *  - **Confidentiality** — `encrypt`/`decrypt` route through the scope's DEK
 *    (`SecretCrypto`, scopeId = tenantId, KEK-wrapped). Non-deterministic, so
 *    a DB dump never reveals a stored field (an email, a display name, …)
 *    in clear.
 *  - **Lookup** — `blindIndex(value)` is a DETERMINISTIC keyed digest
 *    (HMAC-SHA256 over the normalized value) stored alongside the ciphertext.
 *    It enables exact-match queries + uniqueness on encrypted fields.
 *    **Exact match only** (Option A) — no substring, no sort on encrypted
 *    fields.
 *
 * The HMAC index key is per-scope, generated once and persisted **encrypted**
 * (via the same DEK) in a `<prefix>system_keys` doc — never in plaintext at
 * rest, and never in the user-facing SecretStore. Build via `createFieldCrypto`.
 */
export class FieldCrypto {
    constructor(
        private readonly scopeId: string,
        private readonly crypto: SecretCrypto,
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

type SystemKeyDoc = { _id: string; ciphertext: Buffer; iv: Buffer };
const FIELD_INDEX_KEY = "field_index";

/**
 * Load (or generate + persist) the per-tenant blind-index key, then build a
 * `FieldCrypto`. The key is stored encrypted under the tenant DEK in
 * `<prefix>system_keys` — out of the user-facing SecretStore.
 */
export async function createFieldCrypto(
    scopeId: string,
    crypto: SecretCrypto,
    db: Db,
    collectionPrefix = "",
): Promise<FieldCrypto> {
    const col: Collection<SystemKeyDoc> = db.collection<SystemKeyDoc>(collectionPrefix + "system_keys");

    const existing = await col.findOne({ _id: FIELD_INDEX_KEY });
    if (existing) {
        const hex = await crypto.decrypt(scopeId, {
            ciphertext: asBuffer(existing.ciphertext),
            iv: asBuffer(existing.iv),
        });
        return new FieldCrypto(scopeId, crypto, Buffer.from(hex, "hex"));
    }

    const hex = randomBytes(32).toString("hex");
    const blob = await crypto.encrypt(scopeId, hex);
    try {
        await col.insertOne({ _id: FIELD_INDEX_KEY, ciphertext: blob.ciphertext, iv: blob.iv });
    } catch (e) {
        // Lost a creation race — re-read the winner's key.
        if (e && typeof e === "object" && (e as { code?: number }).code === 11000) {
            const winner = await col.findOne({ _id: FIELD_INDEX_KEY });
            if (winner) {
                const hx = await crypto.decrypt(scopeId, { ciphertext: winner.ciphertext, iv: winner.iv });
                return new FieldCrypto(scopeId, crypto, Buffer.from(hx, "hex"));
            }
        }
        throw e;
    }
    return new FieldCrypto(scopeId, crypto, Buffer.from(hex, "hex"));
}
