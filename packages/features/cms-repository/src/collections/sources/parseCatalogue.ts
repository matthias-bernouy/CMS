import type { CollectionRepositoryEntry } from "./interfaces";
import { isCollectionNamespace } from "../core/namespace";
import { isCanonicalSemVer } from "cms-repository/exports/contracts/compatibility";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;

export type CollectionCataloguePage = Readonly<{
    entries: CollectionRepositoryEntry[];
    nextCursor?: string;
}>;

export function validCollectionReference(reference: {
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
}): boolean {
    return (
        validIdentifier(reference.publisherId) &&
        isCollectionNamespace(reference.collectionId) &&
        isCanonicalSemVer(reference.version) &&
        DIGEST.test(reference.digest)
    );
}

export function validCollectionRepositoryId(id: string): boolean {
    return validIdentifier(id);
}

export function parseCollectionCataloguePage(data: unknown, repositoryId: string): CollectionCataloguePage {
    if (
        !isPlainRecord(data) ||
        Object.keys(data).some((key) => key !== "releases" && key !== "nextCursor") ||
        !Array.isArray(data.releases) ||
        (data.nextCursor !== undefined && (typeof data.nextCursor !== "string" || !CURSOR.test(data.nextCursor)))
    ) {
        throw new TypeError("Invalid repository catalogue");
    }
    const releases = data.releases;
    if (releases.length > 256) {
        throw new TypeError("Repository catalogue is too large");
    }
    const entries = releases.map((item) => {
        if (
            !isPlainRecord(item) ||
            Object.keys(item).some(
                (key) =>
                    ![
                        "publisherId",
                        "collectionId",
                        "version",
                        "digest",
                        "name",
                        "description",
                        "blocCount",
                        "hasTheme",
                    ].includes(key),
            )
        ) {
            throw new TypeError("Invalid repository entry");
        }
        const entry = item;
        if (typeof entry.publisherId !== "string" || !validIdentifier(entry.publisherId)) {
            throw new TypeError("Invalid repository publisherId");
        }
        if (!isCollectionNamespace(entry.collectionId)) {
            throw new TypeError("Invalid repository collectionId");
        }
        if (
            typeof entry.version !== "string" ||
            !isCanonicalSemVer(entry.version) ||
            typeof entry.digest !== "string" ||
            !DIGEST.test(entry.digest)
        ) {
            throw new TypeError("Invalid repository release identity");
        }
        if (
            typeof entry.name !== "string" ||
            entry.name.length === 0 ||
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
            repositoryId,
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
    const coordinates = entries.map((entry) => `${entry.publisherId}\0${entry.collectionId}\0${entry.version}`);
    if (new Set(coordinates).size !== coordinates.length) {
        throw new TypeError("Duplicate collection repository release coordinates");
    }
    return { entries, ...(typeof data.nextCursor === "string" ? { nextCursor: data.nextCursor } : {}) };
}

function validIdentifier(value: string): boolean {
    return value.length <= 96 && IDENTIFIER.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
