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
    readonly activeKeyId = "legacy";
    private readonly _ring: LocalKekRingProvider;

    constructor(kek: Buffer) {
        if (kek.length !== DEK_BYTES) {
            throw new Error(`LocalKekProvider: KEK must be ${DEK_BYTES} bytes, got ${kek.length}.`);
        }
        this._ring = new LocalKekRingProvider(this.activeKeyId, { [this.activeKeyId]: kek });
    }

    generateDek(): Promise<{ wrapped: string; plaintext: Buffer; keyId: string }> {
        return this._ring.generateDek();
    }

    wrap(plaintext: Buffer): Promise<{ wrapped: string; keyId: string }> {
        return this._ring.wrap(plaintext);
    }

    unwrap(wrapped: string, keyId = this.activeKeyId): Promise<Buffer> {
        return this._ring.unwrap(wrapped, keyId);
    }

    hasKey(keyId: string): boolean {
        return this._ring.hasKey(keyId);
    }
}

/** Local key ring with one active key and retained historical unwrap keys. */
export class LocalKekRingProvider implements KekProvider {
    readonly activeKeyId: string;
    private readonly _keys: ReadonlyMap<string, Buffer>;

    constructor(activeKeyId: string, keys: Readonly<Record<string, Buffer>>) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(activeKeyId)) {
            throw new Error("LocalKekRingProvider: active key ID is invalid.");
        }
        const entries = Object.entries(keys);
        if (!entries.some(([keyId]) => keyId === activeKeyId)) {
            throw new Error(`LocalKekRingProvider: active key "${activeKeyId}" is missing from the key ring.`);
        }
        for (const [keyId, key] of entries) {
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(keyId)) {
                throw new Error(`LocalKekRingProvider: key ID "${keyId}" is invalid.`);
            }
            if (key.length !== DEK_BYTES) {
                throw new Error(`LocalKekRingProvider: KEK ${keyId} must be ${DEK_BYTES} bytes, got ${key.length}.`);
            }
        }
        this.activeKeyId = activeKeyId;
        this._keys = new Map(entries.map(([keyId, key]) => [keyId, Buffer.from(key)]));
    }

    async generateDek(): Promise<{ wrapped: string; plaintext: Buffer; keyId: string }> {
        const dek = randomBytes(DEK_BYTES);
        return { ...(await this.wrap(dek)), plaintext: dek };
    }

    async wrap(plaintext: Buffer): Promise<{ wrapped: string; keyId: string }> {
        if (plaintext.length !== DEK_BYTES) {
            throw new Error(`LocalKekRingProvider: DEK must be ${DEK_BYTES} bytes, got ${plaintext.length}.`);
        }
        const key = this._keys.get(this.activeKeyId)!;
        return { wrapped: serializeBlob(encryptAesGcm(plaintext, key)), keyId: this.activeKeyId };
    }

    async unwrap(wrapped: string, keyId: string): Promise<Buffer> {
        const key = this._keys.get(keyId);
        if (!key) {
            throw new Error(`LocalKekRingProvider: referenced KEK "${keyId}" is unavailable.`);
        }
        return decryptAesGcm(parseBlob(wrapped), key);
    }

    hasKey(keyId: string): boolean {
        return this._keys.has(keyId);
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
        iv: Buffer.from(s.slice(0, idx), "base64"),
        ciphertext: Buffer.from(s.slice(idx + 1), "base64"),
    };
}
