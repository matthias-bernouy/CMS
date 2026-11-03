const CATALOGUE_CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;

export function isRepositoryCatalogueCursor(value: unknown): value is string {
    return typeof value === "string" && CATALOGUE_CURSOR.test(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

/** Project a bounded registry wire page into one source's existing metadata codec. */
export function registryCataloguePage(value: unknown, kind: string, identifier: string): unknown {
    if (
        !isPlainRecord(value) ||
        Object.keys(value).some((key) => !["releases", "nextCursor"].includes(key)) ||
        !Array.isArray(value.releases) ||
        value.releases.length > 256
    ) {
        throw new TypeError("Invalid registry catalogue page");
    }
    return {
        ...value,
        releases: value.releases.map((entry) => {
            if (
                !isPlainRecord(entry) ||
                entry.kind !== kind ||
                !isPlainRecord(entry.metadata) ||
                Object.keys(entry).some(
                    (key) => !["kind", "publisherId", "id", "version", "digest", "metadata"].includes(key),
                ) ||
                Object.keys(entry.metadata).some((key) =>
                    ["kind", "publisherId", "id", "version", "digest", identifier].includes(key),
                )
            ) {
                throw new TypeError("Invalid registry catalogue entry");
            }
            return {
                ...entry.metadata,
                publisherId: entry.publisherId,
                [identifier]: entry.id,
                version: entry.version,
                digest: entry.digest,
            };
        }),
    };
}
