import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type {
    CollectionRepositoryEntry,
    CollectionRepositoryReference,
    CollectionRepositorySource,
} from "./interfaces";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export class HttpCollectionRepository implements CollectionRepositorySource {
    readonly id: string;
    private readonly base: URL;
    constructor(id: string, baseUrl: string) {
        if (!IDENTIFIER.test(id)) {
            throw new TypeError("Invalid collection repository ID");
        }
        const url = new URL(baseUrl);
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (
            (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
        ) {
            throw new TypeError("Collection repository must use HTTPS or loopback HTTP without URL credentials");
        }
        this.id = id;
        this.base = new URL(`${url.toString().replace(/\/+$/, "")}/`);
    }
    async list(): Promise<CollectionRepositoryEntry[]> {
        const data = await this.request("v1/collections");
        if (!data || typeof data !== "object" || !Array.isArray((data as { releases?: unknown }).releases)) {
            throw new TypeError("Invalid repository catalogue");
        }
        const releases = (data as { releases: unknown[] }).releases;
        if (releases.length > 256) {
            throw new TypeError("Repository catalogue is too large");
        }
        return releases.map((item) => {
            if (!item || typeof item !== "object") {
                throw new TypeError("Invalid repository entry");
            }
            const entry = item as Record<string, unknown>;
            for (const key of ["publisherId", "collectionId"] as const) {
                if (typeof entry[key] !== "string" || !IDENTIFIER.test(entry[key])) {
                    throw new TypeError(`Invalid repository ${key}`);
                }
            }
            if (
                typeof entry.version !== "string" ||
                !VERSION.test(entry.version) ||
                typeof entry.digest !== "string" ||
                !DIGEST.test(entry.digest)
            ) {
                throw new TypeError("Invalid repository release identity");
            }
            if (
                typeof entry.name !== "string" ||
                entry.name.length > 128 ||
                typeof entry.description !== "string" ||
                entry.description.length > 4096 ||
                !Number.isSafeInteger(entry.blocCount) ||
                (entry.blocCount as number) < 0 ||
                (entry.hasTheme !== true && entry.hasTheme !== false)
            ) {
                throw new TypeError("Invalid repository entry metadata");
            }
            return {
                repositoryId: this.id,
                publisherId: entry.publisherId,
                collectionId: entry.collectionId,
                version: entry.version,
                digest: entry.digest,
                name: entry.name,
                description: entry.description,
                blocCount: entry.blocCount,
                hasTheme: entry.hasTheme,
            } as CollectionRepositoryEntry;
        });
    }
    async get(reference: CollectionRepositoryReference): Promise<unknown> {
        if (
            !IDENTIFIER.test(reference.publisherId) ||
            !IDENTIFIER.test(reference.collectionId) ||
            !VERSION.test(reference.version) ||
            !DIGEST.test(reference.digest)
        ) {
            throw new TypeError("Invalid repository reference");
        }
        return this.request(
            `v1/collections/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.collectionId)}/${encodeURIComponent(reference.version)}`,
        );
    }
    private async request(path: string): Promise<unknown> {
        const response = await fetch(new URL(path, this.base), {
            signal: AbortSignal.timeout(10_000),
            redirect: "error",
            headers: { Accept: "application/json" },
        });
        if (!response.ok || !response.body) {
            throw new Error(`Collection repository request failed (${response.status})`);
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            while (true) {
                const part = await reader.read();
                if (part.done) {
                    break;
                }
                length += part.value.byteLength;
                if (length > 2 * 1024 * 1024) {
                    await reader.cancel();
                    throw new Error("Collection repository response too large");
                }
                chunks.push(part.value);
            }
        } finally {
            reader.releaseLock();
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return parseStrictJson(bytes, 2 * 1024 * 1024, 64);
    }
}
