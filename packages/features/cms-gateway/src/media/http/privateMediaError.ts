/** Media routes may reveal authorization state, so errors share the private response policy. */
export function privateMediaError(status: number, headers: Record<string, string> = {}): Response {
    return new Response(null, { status, headers: { ...headers, "cache-control": "private, no-store" } });
}
