import { isResourceId, resourcePublisher } from "@bernouy/ulvia-contracts/protocol";
import { compareSemVer, releaseChannel, isCanonicalSemVer } from "@bernouy/ulvia-contracts/compatibility";
import { createHash } from "node:crypto";

export function compareCatalogueKeys(left: string, right: string): number {
    const a = left.split("\0");
    const b = right.split("\0");
    for (let index = 0; index < 2; index++) {
        if (a[index] !== b[index]) {
            return a[index]! < b[index]! ? -1 : 1;
        }
    }
    const compared = compareSemVer(a[2]!, b[2]!);
    // Build metadata does not affect SemVer precedence; retain deterministic exact-coordinate order.
    return compared || (left < right ? -1 : left > right ? 1 : 0);
}

import type {
    RepositoryCatalogueEntry,
    RepositoryCatalogueReader,
    RepositoryCatalogueType,
} from "cms-repository/repository/filesystem/catalogueIndex";

export class CatalogueInputError extends TypeError {}

const DEFAULT_PAGE_SIZE = 256;
const MAX_PAGE_SIZE = 256;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;
type CatalogueFilters = Readonly<{
    publisherId?: string;
    id?: string;
    version?: string;
    channel?: "stable" | "beta" | "all";
}>;

/** Catalogue pagination for the admitted Repository capability service. */
export async function cataloguePage(
    type: RepositoryCatalogueType,
    index: RepositoryCatalogueReader,
    suppliedLimit: string | null,
    cursor: string | null,
    refresh = false,
    filters: CatalogueFilters = {},
) {
    const limit = parseLimit(suppliedLimit);
    if (filters.channel !== undefined && !["stable", "beta", "all"].includes(filters.channel)) {
        throw new CatalogueInputError("Invalid release channel");
    }
    const fingerprint = createHash("sha256")
        .update(
            JSON.stringify([
                filters.publisherId ?? null,
                filters.id ?? null,
                filters.version ?? null,
                filters.channel ?? "all",
            ]),
        )
        .digest("hex");
    const after = decodeCursor(cursor, type, fingerprint);
    const idKey = type === "collections" ? "collectionId" : type === "contracts" ? "contractId" : "providerId";
    const entries = await index.list(type, refresh);
    const start = after === undefined ? 0 : firstAfter(entries, type, after);
    const releases: RepositoryCatalogueEntry[] = [];
    for (let position = start; position < entries.length; position++) {
        const entry = entries[position]!;
        if (
            (filters.channel === undefined ||
                filters.channel === "all" ||
                releaseChannel(entry.version as string) === filters.channel) &&
            (filters.publisherId === undefined || entry.publisherId === filters.publisherId) &&
            (filters.id === undefined || entry[idKey] === filters.id) &&
            (filters.version === undefined || entry.version === filters.version)
        ) {
            releases.push(entry);
            if (releases.length > limit) {
                break;
            }
        }
    }
    const hasMore = releases.length > limit;
    if (hasMore) {
        releases.pop();
    }
    const nextCursor = hasMore ? encodeCursor(type, releases.at(-1)!, fingerprint) : undefined;
    return { releases, ...(nextCursor ? { nextCursor } : {}) };
}

function parseLimit(value: string | null): number {
    if (value === null) {
        return DEFAULT_PAGE_SIZE;
    }
    if (!/^\d{1,3}$/u.test(value)) {
        throw new CatalogueInputError("Catalogue limit must be an integer");
    }
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        throw new CatalogueInputError(`Catalogue limit must be between 1 and ${MAX_PAGE_SIZE}`);
    }
    return limit;
}

function encodeCursor(type: RepositoryCatalogueType, entry: RepositoryCatalogueEntry, fingerprint: string): string {
    return Buffer.from(JSON.stringify([type, entryKey(type, entry), fingerprint])).toString("base64url");
}

function decodeCursor(value: string | null, type: RepositoryCatalogueType, fingerprint: string): string | undefined {
    if (value === null) {
        return undefined;
    }
    if (!CURSOR.test(value)) {
        throw new CatalogueInputError("Invalid catalogue cursor");
    }
    let decoded: unknown;
    try {
        decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
        throw new CatalogueInputError("Invalid catalogue cursor");
    }
    if (
        !Array.isArray(decoded) ||
        decoded.length !== 3 ||
        decoded[0] !== type ||
        decoded[2] !== fingerprint ||
        typeof decoded[1] !== "string" ||
        decoded[1].length > 512 ||
        !validEntryKey(decoded[1])
    ) {
        throw new CatalogueInputError("Invalid catalogue cursor");
    }
    return decoded[1];
}

function validEntryKey(value: string): boolean {
    const [publisher, id, version, extra] = value.split("\0");
    return (
        extra === undefined &&
        typeof publisher === "string" &&
        publisher.length > 0 &&
        publisher.length <= 96 &&
        typeof id === "string" &&
        isResourceId(id) &&
        resourcePublisher(id) === publisher &&
        isCanonicalSemVer(version)
    );
}

function firstAfter(
    entries: readonly RepositoryCatalogueEntry[],
    type: RepositoryCatalogueType,
    cursor: string,
): number {
    const index = entries.findIndex((entry) => compareCatalogueKeys(entryKey(type, entry), cursor) > 0);
    return index < 0 ? entries.length : index;
}

function entryKey(type: RepositoryCatalogueType, entry: RepositoryCatalogueEntry): string {
    const idKey = type === "collections" ? "collectionId" : type === "contracts" ? "contractId" : "providerId";
    return `${entry.publisherId}\0${entry[idKey]}\0${entry.version}`;
}
