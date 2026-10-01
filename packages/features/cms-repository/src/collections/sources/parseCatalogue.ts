import type { CollectionRepositoryEntry } from "./interfaces";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export function validCollectionReference(reference: {
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
}): boolean {
    return (
        IDENTIFIER.test(reference.publisherId) &&
        IDENTIFIER.test(reference.collectionId) &&
        VERSION.test(reference.version) &&
        DIGEST.test(reference.digest)
    );
}

export function validCollectionRepositoryId(id: string): boolean {
    return IDENTIFIER.test(id);
}

export function parseCollectionCatalogue(data: unknown, repositoryId: string): CollectionRepositoryEntry[] {
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
        if (
            entry.dashboards !== undefined &&
            (!Array.isArray(entry.dashboards) ||
                entry.dashboards.length > 32 ||
                entry.dashboards.some(
                    (dashboard: unknown) =>
                        !dashboard ||
                        typeof dashboard !== "object" ||
                        typeof (dashboard as Record<string, unknown>).id !== "string" ||
                        !IDENTIFIER.test((dashboard as { id: string }).id) ||
                        typeof (dashboard as Record<string, unknown>).name !== "string" ||
                        (dashboard as { name: string }).name.length > 128 ||
                        ((dashboard as Record<string, unknown>).icon !== undefined &&
                            (typeof (dashboard as Record<string, unknown>).icon !== "string" ||
                                !IDENTIFIER.test((dashboard as { icon: string }).icon))) ||
                        typeof (dashboard as Record<string, unknown>).description !== "string" ||
                        (dashboard as { description: string }).description.length > 4096 ||
                        !Number.isSafeInteger((dashboard as Record<string, unknown>).viewCount) ||
                        ((dashboard as Record<string, unknown>).viewCount as number) < 1,
                ))
        ) {
            throw new TypeError("Invalid repository dashboard summaries");
        }
        return {
            repositoryId,
            publisherId: entry.publisherId,
            collectionId: entry.collectionId,
            version: entry.version,
            digest: entry.digest,
            name: entry.name,
            description: entry.description,
            blocCount: entry.blocCount,
            hasTheme: entry.hasTheme,
            ...(entry.dashboards === undefined ? {} : { dashboards: entry.dashboards }),
        } as CollectionRepositoryEntry;
    });
}
