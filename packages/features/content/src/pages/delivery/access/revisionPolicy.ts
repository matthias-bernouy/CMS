import type { CacheEntry } from "@bernouy/http-runner";

/** Weak metadata follows exact render artifacts, without exposing internal policy as HTTP headers. */
const revisionValidatedEntries = new WeakSet<CacheEntry>();
const revisionValidatedPages = new WeakSet<Response>();
const pageRevisions = new WeakMap<Response, string>();
export function markRevisionValidatedEntry(entry: CacheEntry): CacheEntry {
    revisionValidatedEntries.add(entry);
    return entry;
}
export function isRevisionValidatedEntry(entry: CacheEntry | null): boolean {
    return entry !== null && revisionValidatedEntries.has(entry);
}
export function markRevisionValidatedPage(response: Response): Response {
    revisionValidatedPages.add(response);
    return response;
}
export function isRevisionValidatedPage(response: Response): boolean {
    return revisionValidatedPages.has(response);
}
export function inheritRevisionPolicy(source: Response, target: Response): Response {
    return revisionValidatedPages.has(source) ? markRevisionValidatedPage(target) : target;
}

/** Bind the producing instance's clock, never an unrelated Edge/Provider clock. */
export function bindRevisionValidatedPage(response: Response, revision: string): void {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(revision)) {
        throw new TypeError("Invalid source resource revision");
    }
    if (revisionValidatedPages.has(response)) {
        pageRevisions.set(response, revision);
    }
}
export function revisionValidatedPageRevision(response: Response): string | undefined {
    return pageRevisions.get(response);
}
