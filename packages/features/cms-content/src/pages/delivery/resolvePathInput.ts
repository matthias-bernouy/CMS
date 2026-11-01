export interface ResolvePathRequest {
    readonly path: string;
    readonly method: "GET" | "HEAD";
    readonly query: readonly { readonly name: string; readonly value: string }[];
}
const FIELDS = new Set(["path", "method", "query"]);
export function parseResolvePathRequest(value: unknown): ResolvePathRequest {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid public path request");
    }
    const input = value as Record<string, unknown>;
    if (
        Object.keys(input).some((key) => !FIELDS.has(key)) ||
        typeof input.path !== "string" ||
        !input.path.startsWith("/") ||
        input.path.startsWith("//") ||
        /[?#\\\x00- \x7f]/u.test(input.path) ||
        input.path.length > 4096 ||
        !["GET", "HEAD"].includes(String(input.method))
    ) {
        throw new TypeError("Invalid public path");
    }
    const normalized = new URL(input.path, "https://content.invalid");
    if (normalized.pathname !== input.path) {
        throw new TypeError("Public paths must be canonical");
    }
    if (
        !Array.isArray(input.query) ||
        input.query.length > 64 ||
        JSON.stringify(input.query).length > 8192 ||
        input.query.some(
            (part) =>
                !part ||
                typeof part !== "object" ||
                Object.keys(part).sort().join() !== "name,value" ||
                typeof part.name !== "string" ||
                typeof part.value !== "string" ||
                part.name.length > 256 ||
                part.value.length > 4096,
        )
    ) {
        throw new TypeError("Invalid public query");
    }
    return structuredClone(input) as unknown as ResolvePathRequest;
}
export function publicPathRequest(
    input: ResolvePathRequest,
    publicUrl: string,
    context: { readonly headers?: HeadersInit; readonly signal?: AbortSignal } = {},
): Request {
    const url = new URL(input.path, publicUrl);
    for (const part of input.query) {
        url.searchParams.append(part.name, part.value);
    }
    return new Request(url, { method: input.method, headers: context.headers, signal: context.signal });
}
