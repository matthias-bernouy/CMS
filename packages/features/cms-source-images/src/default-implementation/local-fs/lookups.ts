import { mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "../../core/identity";
import { MAX_PUBLIC_SOURCE_FRESHNESS_MS } from "../../core/policy";
import type { SourceImageLookup } from "../../interfaces/cache";
import { atomicWriteJson } from "./atomic";
import { directoryFileNames, removeFile, removeTemporaryFiles } from "./maintenance";
import { lookupRecord, parseLookupRecord, type LookupDiskRecord } from "./records";

const METADATA_FILE = /^[a-f0-9]{64}\.json$/;

export class LocalLookupStore {
    private readonly records = new Map<string, LookupDiskRecord>();

    constructor(
        private readonly directory: string,
        private readonly options: { maxEntries: number; maxAgeMs: number; now: () => number },
    ) {}

    async initialize(): Promise<void> {
        await mkdir(this.directory, { recursive: true });
        this.records.clear();
        const names = await directoryFileNames(this.directory);
        await removeTemporaryFiles(this.directory, names);
        const loaded: LookupDiskRecord[] = [];
        for (const name of names.filter((candidate) => METADATA_FILE.test(candidate))) {
            const metadataPath = join(this.directory, name);
            const disk = await this.readMetadata(metadataPath);
            if (!disk || name !== `${disk.keyDigest}.json` || this.isDiscardableAtStartup(disk)) {
                await removeFile(metadataPath);
                continue;
            }
            loaded.push(disk);
        }
        loaded.sort((left, right) => left.createdAt - right.createdAt || left.keyDigest.localeCompare(right.keyDigest));
        for (const disk of loaded) {
            this.records.set(disk.keyDigest, disk);
        }
        await this.evictToBounds();
    }

    async get(key: string): Promise<SourceImageLookup | null> {
        const keyDigest = await sha256Hex(key);
        const disk = this.records.get(keyDigest);
        if (!disk) {
            return null;
        }
        if (this.hasInvalidFreshnessWindow(disk) || this.isPastRetention(disk)) {
            await this.deleteByDigest(keyDigest);
            return null;
        }
        this.records.delete(keyDigest);
        this.records.set(keyDigest, disk);
        return {
            derivativeKey: disk.derivativeKey,
            freshUntil: disk.freshUntil,
            createdAt: disk.createdAt,
        };
    }

    async put(key: string, value: SourceImageLookup): Promise<void> {
        const keyDigest = await sha256Hex(key);
        const disk = lookupRecord(value, keyDigest);
        if (this.hasInvalidFreshnessWindow(disk)) {
            throw new RangeError("Source image lookup freshness must be current and bounded to one hour");
        }
        await atomicWriteJson(join(this.directory, `${keyDigest}.json`), disk);
        this.records.delete(keyDigest);
        this.records.set(keyDigest, disk);
        await this.evictToBounds();
    }

    async delete(key: string): Promise<void> {
        await this.deleteByDigest(await sha256Hex(key));
    }

    private async deleteByDigest(keyDigest: string): Promise<void> {
        this.records.delete(keyDigest);
        await unlink(join(this.directory, `${keyDigest}.json`)).catch(() => undefined);
    }

    private isDiscardableAtStartup(disk: LookupDiskRecord): boolean {
        return (
            disk.freshUntil <= this.options.now() || this.hasInvalidFreshnessWindow(disk) || this.isPastRetention(disk)
        );
    }

    private hasInvalidFreshnessWindow(disk: LookupDiskRecord): boolean {
        const now = this.options.now();
        return (
            disk.createdAt > now ||
            disk.freshUntil <= disk.createdAt ||
            disk.freshUntil - disk.createdAt > MAX_PUBLIC_SOURCE_FRESHNESS_MS
        );
    }

    private isPastRetention(disk: LookupDiskRecord): boolean {
        return this.options.now() - disk.createdAt > this.options.maxAgeMs;
    }

    private async evictToBounds(): Promise<void> {
        while (this.records.size > this.options.maxEntries) {
            const oldest = this.records.keys().next().value as string | undefined;
            if (!oldest) {
                break;
            }
            await this.deleteByDigest(oldest);
        }
    }

    private async readMetadata(path: string): Promise<LookupDiskRecord | null> {
        try {
            return parseLookupRecord(JSON.parse(await readFile(path, "utf8")));
        } catch {
            return null;
        }
    }
}
