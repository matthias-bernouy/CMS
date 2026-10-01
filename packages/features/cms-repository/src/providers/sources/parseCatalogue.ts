import type { RepositoryArtifactEntry, RepositoryArtifactKind, RepositoryArtifactReference } from "./interfaces";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CATALOGUE_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

export function validProviderRepositoryId(id: string): boolean {
    return IDENTIFIER.test(id);
}

export function validProviderReference(reference: RepositoryArtifactReference): boolean {
    return (
        IDENTIFIER.test(reference.publisherId) &&
        IDENTIFIER.test(reference.id) &&
        VERSION.test(reference.version) &&
        DIGEST.test(reference.digest)
    );
}

export function parseProviderCatalogue(
    data: unknown,
    repositoryId: string,
    kind: RepositoryArtifactKind,
): readonly RepositoryArtifactEntry[] {
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
            repositoryId,
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
