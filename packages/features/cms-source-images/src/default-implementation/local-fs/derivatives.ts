import { mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "../../core/identity";
import type { SourceImageCacheWrite, SourceImageDerivative } from "../../interfaces/cache";
import { atomicWrite, atomicWriteJson } from "./atomic";
import { directoryFileNames, regularFileSize, removeFile, removeTemporaryFiles } from "./maintenance";
import { derivativeRecord, parseDerivativeRecord, type DerivativeDiskRecord } from "./records";

type IndexedRecord = { disk: DerivativeDiskRecord; lastAccess: number };
const METADATA_FILE = /^[a-f0-9]{64}\.json$/;
const DERIVATIVE_FILE = /^[a-f0-9]{64}-[a-f0-9]{64}\.webp$/;

export class LocalDerivativeStore {
    private readonly records = new Map<string, IndexedRecord>();
    private bytes = 0;

    constructor(
        private readonly directory: string,
        private readonly options: {
            maxBytes: number;
            maxEntries: number;
            maxAgeMs: number;
            now: () => number;
        },
    ) {}

    async initialize(): Promise<void> {
        await mkdir(this.directory, { recursive: true });
        this.records.clear();
        this.bytes = 0;
        const names = await directoryFileNames(this.directory);
        await removeTemporaryFiles(this.directory, names);
        const loaded: DerivativeDiskRecord[] = [];
        const referencedDataFiles = new Set<string>();
        for (const name of names.filter((candidate) => METADATA_FILE.test(candidate))) {
            const metadataPath = join(this.directory, name);
            const disk = await this.readMetadata(metadataPath);
            if (!disk || name !== `${disk.keyDigest}.json`) {
                await removeFile(metadataPath);
                continue;
            }
            if (this.isExpired(disk)) {
                await this.removeDiskFiles(disk);
                continue;
            }
            const dataPath = join(this.directory, disk.dataFile);
            if ((await regularFileSize(dataPath)) !== disk.size) {
                await this.removeDiskFiles(disk);
                continue;
            }
            loaded.push(disk);
            referencedDataFiles.add(disk.dataFile);
        }
        await Promise.all(
            names
                .filter((name) => DERIVATIVE_FILE.test(name) && !referencedDataFiles.has(name))
                .map((name) => removeFile(join(this.directory, name))),
        );
        loaded.sort((left, right) => left.createdAt - right.createdAt || left.keyDigest.localeCompare(right.keyDigest));
        for (const disk of loaded) {
            this.records.set(disk.keyDigest, { disk, lastAccess: disk.createdAt });
            this.bytes += disk.size;
        }
        await this.evictToBounds();
    }

    async get(key: string): Promise<SourceImageDerivative | null> {
        const keyDigest = await sha256Hex(key);
        const indexed = this.records.get(keyDigest);
        if (!indexed) {
            return null;
        }
        if (this.isExpired(indexed.disk)) {
            await this.deleteByDigest(keyDigest);
            return null;
        }
        try {
            const bytes = new Uint8Array(await readFile(join(this.directory, indexed.disk.dataFile)));
            if (bytes.byteLength !== indexed.disk.size || (await sha256Hex(bytes)) !== indexed.disk.byteSha256) {
                await this.deleteByDigest(keyDigest);
                return null;
            }
            indexed.lastAccess = this.options.now();
            return {
                bytes,
                etag: indexed.disk.etag,
                contentType: "image/webp",
                width: indexed.disk.width,
                height: indexed.disk.height,
                createdAt: indexed.disk.createdAt,
            };
        } catch {
            await this.deleteByDigest(keyDigest);
            return null;
        }
    }

    async put(key: string, value: SourceImageDerivative): Promise<SourceImageCacheWrite> {
        const keyDigest = await sha256Hex(key);
        const byteSha256 = await sha256Hex(value.bytes);
        if (value.etag !== `"sha256-${byteSha256}"`) {
            throw new Error("source image derivative ETag does not match its bytes");
        }
        const disk = derivativeRecord(value, keyDigest, byteSha256);
        const previous = this.records.get(keyDigest)?.disk;
        await atomicWrite(join(this.directory, disk.dataFile), value.bytes);
        await atomicWriteJson(join(this.directory, `${keyDigest}.json`), disk);
        if (previous) {
            this.bytes -= previous.size;
        }
        this.records.set(keyDigest, { disk, lastAccess: this.options.now() });
        this.bytes += disk.size;
        if (previous && previous.dataFile !== disk.dataFile) {
            await unlink(join(this.directory, previous.dataFile)).catch(() => undefined);
        }
        return { evicted: await this.evictToBounds() };
    }

    async delete(key: string): Promise<void> {
        await this.deleteByDigest(await sha256Hex(key));
    }

    private async deleteByDigest(keyDigest: string): Promise<void> {
        const indexed = this.records.get(keyDigest);
        this.records.delete(keyDigest);
        if (!indexed) {
            await unlink(join(this.directory, `${keyDigest}.json`)).catch(() => undefined);
            return;
        }
        this.bytes -= indexed.disk.size;
        await Promise.all([
            unlink(join(this.directory, `${keyDigest}.json`)).catch(() => undefined),
            unlink(join(this.directory, indexed.disk.dataFile)).catch(() => undefined),
        ]);
    }

    private isExpired(disk: DerivativeDiskRecord): boolean {
        return this.options.now() - disk.createdAt > this.options.maxAgeMs;
    }

    private async removeDiskFiles(disk: DerivativeDiskRecord): Promise<void> {
        await Promise.all([
            removeFile(join(this.directory, `${disk.keyDigest}.json`)),
            removeFile(join(this.directory, disk.dataFile)),
        ]);
    }

    private async evictToBounds(): Promise<number> {
        let evicted = 0;
        while (this.bytes > this.options.maxBytes || this.records.size > this.options.maxEntries) {
            const oldest = [...this.records].sort((left, right) => left[1].lastAccess - right[1].lastAccess)[0]?.[0];
            if (!oldest) {
                break;
            }
            await this.deleteByDigest(oldest);
            evicted += 1;
        }
        return evicted;
    }

    private async readMetadata(path: string): Promise<DerivativeDiskRecord | null> {
        try {
            return parseDerivativeRecord(JSON.parse(await readFile(path, "utf8")));
        } catch {
            return null;
        }
    }
}
