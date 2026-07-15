const PRIVATE_AUTH_CACHE_CONTROL = "private, no-store";
const AUTH_VARY_HEADERS = ["Cookie", "Authorization"] as const;

/** Builds an authentication response that browsers and shared caches cannot retain. */
export function privateAuthResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
    return new Response(body, {
        ...init,
        headers: privateAuthHeaders(init.headers),
    });
}

/** JSON variant of {@link privateAuthResponse}. */
export function privateAuthJsonResponse(
    body: unknown,
    status = 200,
    headers: HeadersInit = {},
): Response {
    const out = new Headers(headers);
    if (!out.has("Content-Type")) out.set("Content-Type", "application/json");
    return privateAuthResponse(JSON.stringify(body), { status, headers: out });
}

function privateAuthHeaders(input: HeadersInit | undefined): Headers {
    const headers = new Headers(input);
    headers.set("Cache-Control", PRIVATE_AUTH_CACHE_CONTROL);
    headers.set("X-Content-Type-Options", "nosniff");
    mergeVary(headers, AUTH_VARY_HEADERS);
    return headers;
}

function mergeVary(headers: Headers, required: readonly string[]): void {
    const current = headers.get("Vary")?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
    if (current.includes("*")) return;

    const normalized = new Set(current.map(value => value.toLowerCase()));
    for (const value of required) {
        if (!normalized.has(value.toLowerCase())) current.push(value);
    }
    headers.set("Vary", current.join(", "));
}
