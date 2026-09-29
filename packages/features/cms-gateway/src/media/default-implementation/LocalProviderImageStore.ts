import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { providerByteGeneration } from "cms-gateway/media/core/derivativeKey";
import { keyName, parseRecord, type DiskRecord } from "cms-gateway/media/default-implementation/localStoreRecord";
import type {
    ProviderImageDerivative,
    ProviderImageDerivativeStore,
} from "cms-gateway/media/core/providerImageService";

/** Reconstructible provider derivatives, kept outside the CMS author file tree. */
export class LocalProviderImageStore implements ProviderImageDerivativeStore {
    readonly #maxBytes: number;
    readonly #maxAgeMs: number;
    #initializing?: Promise<void>;

    constructor(
        private readonly directory: string,
        options: { maxBytes?: number; maxAgeMs?: number } = {},
    ) {
        this.#maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
        this.#maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
        if (
            !Number.isSafeInteger(this.#maxBytes) ||
            this.#maxBytes <= 0 ||
            !Number.isSafeInteger(this.#maxAgeMs) ||
            this.#maxAgeMs <= 0
        ) {
            throw new TypeError("provider image cache bounds are invalid");
        }
    }

    initialize(): Promise<void> {
        this.#initializing ??= mkdir(this.directory, { recursive: true }).then(() => this.#prune(true));
        return this.#initializing;
    }

    async get(key: string): Promise<ProviderImageDerivative | null> {
        const name = keyName(key);
        await this.initialize();
        try {
            const record = parseRecord(JSON.parse(await readFile(join(this.directory, `${name}.json`), "utf8")));
            if (!record || Date.now() - record.createdAt > this.#maxAgeMs) {
                await this.#remove(name);
                return null;
            }
            const bytes = new Uint8Array(await readFile(join(this.directory, `${name}.webp`)));
            if (bytes.byteLength !== record.size || (await providerByteGeneration(bytes)) !== record.byteDigest) {
                await this.#remove(name);
                return null;
            }
            return { bytes, etag: record.etag, width: record.width, height: record.height };
        } catch {
            return null;
        }
    }

    async put(key: string, derivative: ProviderImageDerivative): Promise<void> {
        const name = keyName(key);
        await this.initialize();
        if (
            !Number.isSafeInteger(derivative.width) ||
            derivative.width <= 0 ||
            !Number.isSafeInteger(derivative.height) ||
            derivative.height <= 0 ||
            derivative.bytes.byteLength > this.#maxBytes
        ) {
            throw new TypeError("provider image derivative is invalid");
        }
        const byteDigest = await providerByteGeneration(derivative.bytes);
        if (derivative.etag !== `"${byteDigest}"`) {
            throw new TypeError("provider image ETag does not match its bytes");
        }
        const record: DiskRecord = {
            schema: "cms.provider-image.v1",
            byteDigest,
            etag: derivative.etag,
            width: derivative.width,
            height: derivative.height,
            size: derivative.bytes.byteLength,
            createdAt: Date.now(),
        };
        await atomicWrite(join(this.directory, `${name}.webp`), derivative.bytes);
        await atomicWrite(join(this.directory, `${name}.json`), new TextEncoder().encode(JSON.stringify(record)));
        await this.#prune(false);
    }

    async #remove(name: string): Promise<void> {
        await Promise.all([
            unlink(join(this.directory, `${name}.json`)).catch(() => undefined),
            unlink(join(this.directory, `${name}.webp`)).catch(() => undefined),
        ]);
    }

    async #prune(removeOrphans: boolean): Promise<void> {
        const names = await readdir(this.directory);
        if (removeOrphans) {
            await Promise.all(
                names
                    .filter((name) => name.endsWith(".tmp"))
                    .map((name) => unlink(join(this.directory, name)).catch(() => undefined)),
            );
        }
        const entries: Array<{ name: string; size: number; createdAt: number }> = [];
        for (const filename of names.filter((name) => /^[a-f0-9]{64}\.json$/.test(name))) {
            const name = filename.slice(0, -5);
            try {
                const record = parseRecord(JSON.parse(await readFile(join(this.directory, filename), "utf8")));
                if (!record || Date.now() - record.createdAt > this.#maxAgeMs) {
                    await this.#remove(name);
                    continue;
                }
                if ((await stat(join(this.directory, `${name}.webp`))).size !== record.size) {
                    await this.#remove(name);
                    continue;
                }
                entries.push({ name, size: record.size, createdAt: record.createdAt });
            } catch {
                await this.#remove(name);
            }
        }
        if (removeOrphans) {
            const retained = new Set(entries.map((entry) => entry.name));
            await Promise.all(
                names
                    .filter((name) => /^[a-f0-9]{64}\.webp$/.test(name) && !retained.has(name.slice(0, -5)))
                    .map((name) => unlink(join(this.directory, name)).catch(() => undefined)),
            );
        }
        let total = entries.reduce((sum, entry) => sum + entry.size, 0);
        for (const entry of entries.sort((a, b) => a.createdAt - b.createdAt)) {
            if (total <= this.#maxBytes) {
                break;
            }
            await this.#remove(entry.name);
            total -= entry.size;
        }
    }
}

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    try {
        await writeFile(temporary, bytes, { mode: 0o600 });
        await rename(temporary, path);
    } finally {
        await unlink(temporary).catch(() => undefined);
    }
}
