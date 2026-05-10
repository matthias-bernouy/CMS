import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM helpers.
 *
 * Output layout: ciphertext bytes followed by the 16-byte auth tag, all
 * in a single Buffer. Caller is responsible for storing the IV next to it
 * (typically as a separate field). IV is 12 bytes random per operation —
 * never reuse an IV with the same key.
 */
const ALGO = "aes-256-gcm";
const IV_BYTES  = 12;
const TAG_BYTES = 16;

export type EncryptedBlob = {
    ciphertext: Buffer;   // raw ciphertext + 16-byte GCM tag concatenated
    iv:         Buffer;   // 12 bytes
};

export function encryptAesGcm(plaintext: Buffer | string, key: Buffer): EncryptedBlob {
    if (key.length !== 32) {
        throw new Error(`encryptAesGcm: key must be 32 bytes, got ${key.length}.`);
    }
    const iv     = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, key, iv);
    const input  = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
    const enc    = Buffer.concat([cipher.update(input), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([enc, tag]), iv };
}

export function decryptAesGcm(blob: EncryptedBlob, key: Buffer): Buffer {
    if (key.length !== 32) {
        throw new Error(`decryptAesGcm: key must be 32 bytes, got ${key.length}.`);
    }
    if (blob.iv.length !== IV_BYTES) {
        throw new Error(`decryptAesGcm: iv must be ${IV_BYTES} bytes, got ${blob.iv.length}.`);
    }
    if (blob.ciphertext.length < TAG_BYTES) {
        throw new Error("decryptAesGcm: ciphertext shorter than the GCM tag.");
    }
    const cutoff   = blob.ciphertext.length - TAG_BYTES;
    const enc      = blob.ciphertext.subarray(0, cutoff);
    const tag      = blob.ciphertext.subarray(cutoff);
    const decipher = createDecipheriv(ALGO, key, blob.iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
}
