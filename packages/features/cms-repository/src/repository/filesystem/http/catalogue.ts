import type { RepositoryCatalogueEntry, RepositoryCatalogueReader, RepositoryCatalogueType } from "../catalogueIndex";

const DEFAULT_PAGE_SIZE = 256;
const MAX_PAGE_SIZE = 256;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;

export async function readCatalogue(
    request: Request,
    type: string | undefined,
    index: RepositoryCatalogueReader,
    refresh = false,
): Promise<Response | null> {
    if (!catalogueType(type)) {
        return null;
    }
    try {
        const url = new URL(request.url);
        if ([...url.searchParams.keys()].some((key) => key !== "cursor" && key !== "limit")) {
            return invalidQuery("Unsupported catalogue query parameter");
        }
        const limit = parseLimit(url.searchParams.get("limit"));
        const after = decodeCursor(url.searchParams.get("cursor"), type);
        const entries = await index.list(type, refresh);
        const start = after === undefined ? 0 : firstAfter(entries, type, after);
        const releases = entries.slice(start, start + limit);
        const nextCursor = start + releases.length < entries.length ? encodeCursor(type, releases.at(-1)!) : undefined;
        return Response.json(
            { releases, ...(nextCursor ? { nextCursor } : {}) },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return invalidQuery(error instanceof Error ? error.message : "Invalid catalogue query");
    }
}

function parseLimit(value: string | null): number {
    if (value === null) {
        return DEFAULT_PAGE_SIZE;
    }
    if (!/^\d{1,3}$/u.test(value)) {
        throw new TypeError("Catalogue limit must be an integer");
    }
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        throw new TypeError(`Catalogue limit must be between 1 and ${MAX_PAGE_SIZE}`);
    }
    return limit;
}

function encodeCursor(type: RepositoryCatalogueType, entry: RepositoryCatalogueEntry): string {
    return Buffer.from(JSON.stringify([type, entryKey(type, entry)])).toString("base64url");
}

function decodeCursor(value: string | null, type: RepositoryCatalogueType): string | undefined {
    if (value === null) {
        return undefined;
    }
    if (!CURSOR.test(value)) {
        throw new TypeError("Invalid catalogue cursor");
    }
    let decoded: unknown;
    try {
        decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
        throw new TypeError("Invalid catalogue cursor");
    }
    if (
        !Array.isArray(decoded) ||
        decoded.length !== 2 ||
        decoded[0] !== type ||
        typeof decoded[1] !== "string" ||
        decoded[1].length > 512
    ) {
        throw new TypeError("Invalid catalogue cursor");
    }
    return decoded[1];
}

function firstAfter(
    entries: readonly RepositoryCatalogueEntry[],
    type: RepositoryCatalogueType,
    cursor: string,
): number {
    const index = entries.findIndex((entry) => entryKey(type, entry) > cursor);
    return index < 0 ? entries.length : index;
}

function entryKey(type: RepositoryCatalogueType, entry: RepositoryCatalogueEntry): string {
    const idKey = type === "collections" ? "collectionId" : type === "contracts" ? "contractId" : "providerId";
    return `${entry.publisherId}\0${entry[idKey]}\0${entry.version}`;
}

function catalogueType(value: string | undefined): value is RepositoryCatalogueType {
    return value === "collections" || value === "contracts" || value === "providers";
}

function invalidQuery(message: string): Response {
    return Response.json({ error: { code: "invalid_catalogue_query", message } }, { status: 400 });
}
