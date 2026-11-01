import { matchesEntityTag } from "../byteRanges";

export interface HttpValidators {
    readonly etag?: string | null;
    readonly lastModified?: string | null;
    readonly exists?: boolean;
}
/** Call inside the same revision fence as a write. This function never mutates state. */
export function evaluateHttpPreconditions(
    request: Pick<Request, "method" | "headers">,
    current: HttpValidators,
): 304 | 412 | undefined {
    const { headers } = request;
    const exists = current.exists !== false;
    const match = headers.get("if-match");
    if (match !== null) {
        if (!matchesEntityTag(match, current.etag, false, exists)) {
            return 412;
        }
    } else if (olderThan(current.lastModified, headers.get("if-unmodified-since"))) {
        return 412;
    }
    const none = headers.get("if-none-match");
    const reading = ["GET", "HEAD"].includes(request.method);
    if (none !== null) {
        if (matchesEntityTag(none, current.etag, true, exists)) {
            return reading ? 304 : 412;
        }
    } else if (reading && notNewerThan(current.lastModified, headers.get("if-modified-since"))) {
        return 304;
    }
    return undefined;
}
function times(modified: string | null | undefined, condition: string | null): [number, number] | undefined {
    if (!modified || !condition) {
        return undefined;
    }
    const left = Date.parse(modified);
    const right = Date.parse(condition);
    return Number.isFinite(left) && Number.isFinite(right)
        ? [Math.floor(left / 1000), Math.floor(right / 1000)]
        : undefined;
}
function olderThan(modified: string | null | undefined, condition: string | null): boolean {
    const value = times(modified, condition);
    return value !== undefined && value[0] > value[1];
}
function notNewerThan(modified: string | null | undefined, condition: string | null): boolean {
    const value = times(modified, condition);
    return value !== undefined && value[0] <= value[1];
}
