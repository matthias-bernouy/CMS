/** Revalidation is an HTTP outcome, independent of a capability's business output schema. */
export function isRevalidationRequest(method: string, headers: Headers): boolean {
    return (
        ["GET", "HEAD", "QUERY"].includes(method) && (headers.has("if-none-match") || headers.has("if-modified-since"))
    );
}
