export type ByteRange = { start: number; end: number };

/** Parses one RFC 9110 byte range. Other range units are ignored. */
export function parseByteRange(value: string | null, size: number): ByteRange | "unsatisfiable" | null {
    if (!value || !value.toLowerCase().startsWith("bytes=")) {
        return null;
    }
    const expression = value.slice(value.indexOf("=") + 1).trim();
    if (!expression || expression.includes(",") || size === 0) {
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

export function ifRangeAllowsPartial(value: string | null, etag: string): boolean {
    return value === null || value === etag;
}
