import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type {
    ProviderRepositorySource,
    RepositoryArtifactEntry,
    RepositoryArtifactKind,
    RepositoryArtifactReference,
} from "./interfaces";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CATALOGUE_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const MAX_BYTES = 2 * 1024 * 1024;

export class HttpProviderRepository implements ProviderRepositorySource {
    readonly id: string;
    private readonly base: URL;

    constructor(id: string, baseUrl: string) {
        if (!IDENTIFIER.test(id)) {
            throw new TypeError("Invalid provider repository ID");
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
            throw new TypeError("Provider repository must use HTTPS or loopback HTTP without URL credentials");
        }
        this.id = id;
        this.base = new URL(`${url.toString().replace(/\/+$/, "")}/`);
    }

    async list(kind: RepositoryArtifactKind): Promise<readonly RepositoryArtifactEntry[]> {
        const data = parseStrictJson(await this.request(`v1/${pathKind(kind)}`), MAX_BYTES, 64);
        const releases = (data as { releases?: unknown } | null)?.releases;
        if (!Array.isArray(releases) || releases.length > 256) {
            throw new TypeError("Invalid provider repository catalogue");
        }
        return releases.map((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new TypeError("Invalid provider repository entry");
            }
            const item = value as Record<string, unknown>;
            const id = item[kind === "contract" ? "contractId" : "providerId"];
            if (
                typeof item.publisherId !== "string" ||
                !IDENTIFIER.test(item.publisherId) ||
                typeof id !== "string" ||
                !IDENTIFIER.test(id) ||
                typeof item.version !== "string" ||
                !VERSION.test(item.version) ||
                typeof item.digest !== "string" ||
                !DIGEST.test(item.digest) ||
                typeof item.name !== "string" ||
                item.name.length > 128 ||
                (item.description !== undefined &&
                    (typeof item.description !== "string" || item.description.length > 4096)) ||
                (item.icon !== undefined &&
                    (typeof item.icon !== "string" || !CATALOGUE_TOKEN.test(item.icon) || item.icon.length > 32)) ||
                !validCategories(item.categories) ||
                (item.publishedAt !== undefined && !validDateTime(item.publishedAt)) ||
                !validLinks(item.links)
            ) {
                throw new TypeError("Invalid provider repository entry identity");
            }
            return {
                repositoryId: this.id,
                kind,
                publisherId: item.publisherId,
                id,
                version: item.version,
                digest: item.digest,
                name: item.name,
                ...(typeof item.description === "string" ? { description: item.description } : {}),
                ...(typeof item.icon === "string" ? { icon: item.icon } : {}),
                ...(Array.isArray(item.categories) ? { categories: item.categories as string[] } : {}),
                ...(typeof item.publishedAt === "string" ? { publishedAt: item.publishedAt } : {}),
                ...(item.links ? { links: item.links as RepositoryArtifactEntry["links"] } : {}),
            };
        });
    }

    async get(reference: RepositoryArtifactReference): Promise<Uint8Array> {
        if (
            !IDENTIFIER.test(reference.publisherId) ||
            !IDENTIFIER.test(reference.id) ||
            !VERSION.test(reference.version) ||
            !DIGEST.test(reference.digest)
        ) {
            throw new TypeError("Invalid provider repository reference");
        }
        return this.request(
            `v1/${pathKind(reference.kind)}/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.id)}/${encodeURIComponent(reference.version)}`,
        );
    }

    private async request(path: string): Promise<Uint8Array> {
        const response = await fetch(new URL(path, this.base), {
            signal: AbortSignal.timeout(10_000),
            redirect: "error",
            headers: { Accept: "application/json" },
        });
        if (!response.ok || !response.body) {
            throw new Error(`Provider repository request failed (${response.status})`);
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done) {
                    break;
                }
                length += part.value.byteLength;
                if (length > MAX_BYTES) {
                    await reader.cancel();
                    throw new Error("Provider repository response too large");
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
        return bytes;
    }
}

function validLinks(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    const allowed = ["website", "setup", "documentation", "support"];
    const keys = Object.keys(record);
    return (
        keys.length > 0 &&
        keys.every((key) => allowed.includes(key)) &&
        keys.every((key) => {
            if (typeof record[key] !== "string" || record[key].length > 2048) {
                return false;
            }
            try {
                const url = new URL(record[key]);
                const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
                return (
                    (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
                    !url.username &&
                    !url.password
                );
            } catch {
                return false;
            }
        })
    );
}

function validCategories(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.length <= 6 &&
        value.every(
            (category) => typeof category === "string" && category.length <= 32 && CATALOGUE_TOKEN.test(category),
        ) &&
        new Set(value).size === value.length
    );
}

function validDateTime(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 64 || !DATE_TIME.test(value)) {
        return false;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && value.includes("T");
}

function pathKind(kind: RepositoryArtifactKind): "contracts" | "providers" {
    if (kind === "contract") {
        return "contracts";
    }
    if (kind === "provider-manifest") {
        return "providers";
    }
    throw new TypeError("Invalid provider repository kind");
}
