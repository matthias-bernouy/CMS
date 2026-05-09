import type { SecretCrypto } from "../crypto/SecretCrypto";
import type { ProxyAuth } from "../../interfaces/entities/BucketProxy";

/**
 * Internal Mongo shape of `ProxyAuth` — secret string fields are
 * replaced by `{ ciphertext, iv }`. Symmetric helpers below convert to
 * and from the plaintext domain shape using the bucket's DEK.
 */
export type ProxyAuthDoc =
    | { type: 'none' }
    | { type: 'bearer';  encryptedToken: Buffer; iv: Buffer }
    | { type: 'headers'; headers: { name: string; encryptedValue: Buffer; iv: Buffer }[] };

export async function encryptProxyAuth(bucketId: string, auth: ProxyAuth, crypto: SecretCrypto): Promise<ProxyAuthDoc> {
    if (auth.type === 'none')   return { type: 'none' };
    if (auth.type === 'bearer') {
        const blob = await crypto.encryptForBucket(bucketId, auth.token);
        return { type: 'bearer', encryptedToken: blob.ciphertext, iv: blob.iv };
    }
    const headers = await Promise.all(auth.headers.map(async (h) => {
        const blob = await crypto.encryptForBucket(bucketId, h.value);
        return { name: h.name, encryptedValue: blob.ciphertext, iv: blob.iv };
    }));
    return { type: 'headers', headers };
}

export async function decryptProxyAuth(bucketId: string, doc: ProxyAuthDoc, crypto: SecretCrypto): Promise<ProxyAuth> {
    if (doc.type === 'none')   return { type: 'none' };
    if (doc.type === 'bearer') {
        const token = await crypto.decryptForBucket(bucketId, { ciphertext: asBuffer(doc.encryptedToken), iv: asBuffer(doc.iv) });
        return { type: 'bearer', token };
    }
    const headers = await Promise.all(doc.headers.map(async (h) => {
        const value = await crypto.decryptForBucket(bucketId, { ciphertext: asBuffer(h.encryptedValue), iv: asBuffer(h.iv) });
        return { name: h.name, value };
    }));
    return { type: 'headers', headers };
}

/**
 * The mongodb driver returns BSON `Binary` for stored Buffers. The shape
 * exposes `.buffer` as a Buffer, so we normalize at the boundary so the
 * crypto helpers always see a plain Buffer.
 */
function asBuffer(v: Buffer | { buffer: Buffer }): Buffer {
    if (Buffer.isBuffer(v)) return v;
    return Buffer.from(v.buffer);
}
