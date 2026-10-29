import type { EncryptedBlob } from "@bernouy/envelope-crypto";
import type { AuthenticationSecrets } from "./InstanceAuthenticationReader";

type Entry = EncryptedBlob & { secrets: AuthenticationSecrets; bytes: number };

/** Private to one database/scope reader; never stores an authorization decision. */
export class DecryptedAuthenticationCache {
    readonly #entries = new Map<string, Entry>();
    #bytes = 0;

    constructor(
        private readonly maxEntries = 32,
        private readonly maxBytes = 128 * 1024,
    ) {}

    get(key: string, blob: EncryptedBlob): AuthenticationSecrets | undefined {
        const entry = this.#entries.get(key);
        if (!entry) {
            return undefined;
        }
        if (!entry.ciphertext.equals(blob.ciphertext) || !entry.iv.equals(blob.iv)) {
            this.delete(key);
            return undefined;
        }
        this.#entries.delete(key);
        this.#entries.set(key, entry);
        return entry.secrets;
    }

    remember(key: string, blob: EncryptedBlob, secrets: AuthenticationSecrets): void {
        this.delete(key);
        const bytes =
            blob.ciphertext.length +
            blob.iv.length +
            Buffer.byteLength(secrets.instanceAccessToken) +
            Buffer.byteLength(secrets.invocationSecret);
        if (bytes > this.maxBytes || this.maxEntries < 1) {
            return;
        }
        while (this.#entries.size >= this.maxEntries || this.#bytes + bytes > this.maxBytes) {
            const oldest = this.#entries.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.delete(oldest);
        }
        this.#entries.set(key, {
            ciphertext: Buffer.from(blob.ciphertext),
            iv: Buffer.from(blob.iv),
            secrets: Object.freeze({ ...secrets }),
            bytes,
        });
        this.#bytes += bytes;
    }

    delete(key: string): void {
        const entry = this.#entries.get(key);
        if (entry) {
            this.#bytes -= entry.bytes;
            this.#entries.delete(key);
        }
    }
}
