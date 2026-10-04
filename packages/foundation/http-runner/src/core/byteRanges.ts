export type ByteRange = Readonly<{ start: number; end: number }>;
export type ContentRange = ByteRange & Readonly<{ size: number }>;

/** Parse one RFC 9110 byte range. Multiple ranges are deliberately unsupported. */
export function parseSingleByteRange(value: string | null, size: number): ByteRange | "unsatisfiable" | null {
    if (!value || !value.toLowerCase().startsWith("bytes=")) {
        return null;
    }
    const expression = value.slice(value.indexOf("=") + 1).trim();
    if (!expression || expression.includes(",") || !Number.isSafeInteger(size) || size <= 0) {
        return "unsatisfiable";
    }
    const match = /^(\d*)-(\d*)$/u.exec(expression);
    if (!match || (!match[1] && !match[2])) {
        return "unsatisfiable";
    }
    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
            return "unsatisfiable";
        }
        return { start: Math.max(0, size - suffixLength), end: size - 1 };
    }
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) {
        return "unsatisfiable";
    }
    return { start, end: Math.min(requestedEnd, size - 1) };
}

export function parseContentRange(value: string | null): ContentRange | null {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(value ?? "");
    const start = Number(match?.[1]);
    const end = Number(match?.[2]);
    const size = Number(match?.[3]);
    return match && [start, end, size].every(Number.isSafeInteger) && start >= 0 && end >= start && end < size
        ? { start, end, size }
        : null;
}

/** Dates are intentionally unsupported until callers provide a Last-Modified validator. */
export function ifRangeAllowsPartial(value: string | null, strongEtag: string): boolean {
    return value === null || value === strongEtag;
}

/** Weak comparison is correct for GET/HEAD cache revalidation. */
export function ifNoneMatchMatches(value: string | null, etag: string): boolean {
    return (
        value
            ?.split(",")
            .map((candidate) => candidate.trim().replace(/^W\//u, ""))
            .some((candidate) => candidate === "*" || candidate === etag) ?? false
    );
}
