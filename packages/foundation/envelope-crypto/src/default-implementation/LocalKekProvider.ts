import { randomBytes } from "node:crypto";
import { encryptAesGcm, decryptAesGcm, type EncryptedBlob } from "envelope-crypto/core/aesGcm";
import type { KekProvider } from "envelope-crypto/interfaces/KekProvider";

const DEK_BYTES = 32;

/**
 * In-process `KekProvider` — the KEK lives in this process's memory and
 * wraps DEKs locally with AES-GCM. Wrapped form is `<iv-b64>.<ct-b64>`
 * so the storage layer carries a single string field.
 */
export class LocalKekProvider implements KekProvider {

    private readonly _kek: Buffer;

    constructor(kek: Buffer) {
        if (kek.length !== DEK_BYTES) {
            throw new Error(`LocalKekProvider: KEK must be ${DEK_BYTES} bytes, got ${kek.length}.`);
        }
        this._kek = kek;
    }

    async generateDek(): Promise<{ wrapped: string; plaintext: Buffer }> {
        const dek     = randomBytes(DEK_BYTES);
        const wrapped = encryptAesGcm(dek, this._kek);
        return { wrapped: serializeBlob(wrapped), plaintext: dek };
    }

    async unwrap(wrapped: string): Promise<Buffer> {
        return decryptAesGcm(parseBlob(wrapped), this._kek);
    }
}

/**
 * Serialize an `EncryptedBlob` to a single string `<iv-b64>.<ct-b64>`.
 */
export function serializeBlob(blob: EncryptedBlob): string {
    return `${blob.iv.toString("base64")}.${blob.ciphertext.toString("base64")}`;
}

export function parseBlob(s: string): EncryptedBlob {
    const idx = s.indexOf(".");
    if (idx === -1) {
        throw new Error("LocalKekProvider: malformed wrapped DEK (expected '<iv-b64>.<ct-b64>').");
    }
    return {
        iv:         Buffer.from(s.slice(0, idx),     "base64"),
        ciphertext: Buffer.from(s.slice(idx + 1),    "base64"),
    };
}
