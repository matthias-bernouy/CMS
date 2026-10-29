export interface ResolvePathRequest {
    readonly resourceMetadata?: "cache-v1";
    readonly path: string;
    readonly method: "GET" | "HEAD";
    readonly query: readonly { readonly name: string; readonly value: string }[];
    readonly accept?: string;
    readonly acceptLanguage?: string;
    readonly ifNoneMatch?: string;
    readonly ifRange?: string;
    readonly range?: { readonly start?: number; readonly end?: number };
}
const FIELDS = new Set([
    "resourceMetadata",
    "path",
    "method",
    "query",
    "accept",
    "acceptLanguage",
    "ifNoneMatch",
    "ifRange",
    "range",
]);
export function parseResolvePathRequest(value: unknown): ResolvePathRequest {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid public path request");
    }
    const input = value as Record<string, unknown>;
    if (
        Object.keys(input).some((key) => !FIELDS.has(key)) ||
        (input.resourceMetadata !== undefined && input.resourceMetadata !== "cache-v1") ||
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
    for (const name of ["accept", "acceptLanguage", "ifNoneMatch", "ifRange"]) {
        if (
            input[name] !== undefined &&
            (typeof input[name] !== "string" || input[name].length > 1024 || /[\r\n\x00]/u.test(input[name]))
        ) {
            throw new TypeError("Invalid public representation");
        }
    }
    if (input.range !== undefined) {
        const range = input.range as Record<string, unknown>;
        if (
            !range ||
            typeof range !== "object" ||
            Array.isArray(range) ||
            !Object.keys(range).length ||
            Object.keys(range).some((key) => !["start", "end"].includes(key)) ||
            Object.values(range).some((part) => !Number.isSafeInteger(part) || Number(part) < 0) ||
            (range.start !== undefined && range.end !== undefined && Number(range.end) < Number(range.start))
        ) {
            throw new TypeError("Invalid resource range");
        }
    }
    return structuredClone(input) as unknown as ResolvePathRequest;
}
export function publicPathRequest(input: ResolvePathRequest, publicUrl: string): Request {
    const url = new URL(input.path, publicUrl);
    for (const part of input.query) {
        url.searchParams.append(part.name, part.value);
    }
    const headers = new Headers();
    if (input.accept) {
        headers.set("accept", input.accept);
    }
    if (input.acceptLanguage) {
        headers.set("accept-language", input.acceptLanguage);
    }
    if (input.ifNoneMatch) {
        headers.set("if-none-match", input.ifNoneMatch);
    }
    if (input.ifRange) {
        headers.set("if-range", input.ifRange);
    }
    if (input.range) {
        headers.set("range", `bytes=${input.range.start ?? ""}-${input.range.end ?? ""}`);
    }
    return new Request(url, { method: input.method, headers });
}
