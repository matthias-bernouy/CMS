import type { JsonRecord } from "./shipment/types.ts";
import { envText } from "./env.ts";

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export class ProviderStatusError extends HttpError {
    constructor(
        status: number,
        message: string,
        readonly provider: JsonRecord,
    ) {
        super(status, message);
    }
}

export const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id, x-cms-user-role",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            ...corsHeaders,
            "content-type": "application/json; charset=utf-8",
        },
    });
}

export function optionsResponse(): Response {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname;
    const marker = "/cms-delivery";
    const index = pathname.indexOf(marker);
    const route = index === -1 ? pathname : pathname.slice(index + marker.length);
    return route || "/";
}

export async function readJsonObject(request: Request): Promise<JsonRecord> {
    const value = await request.json().catch(() => null);
    if (!isRecord(value)) {
        throw new HttpError(400, "request body must be a JSON object");
    }
    return value;
}

export function requireCmsRequest(request: Request): void {
    const expected = envText("CMS_DELIVERY_API_KEY");
    if (!expected) {
        throw new HttpError(500, "CMS delivery API key is not configured");
    }
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization !== `Bearer ${expected}`) {
        throw new HttpError(401, "unauthorized");
    }
}

export function requireCmsWriteRequest(request: Request): void {
    requireCmsRequest(request);
    if (request.method !== "POST") {
        throw new HttpError(405, "method not allowed");
    }
}

export function requireCmsAdminWriteRequest(request: Request): void {
    requireCmsWriteRequest(request);
    if (request.headers.get("x-cms-user-role")?.trim() !== "admin") {
        throw new HttpError(403, "admin role is required");
    }
}

export function handleError(error: unknown): Response {
    if (!(error instanceof HttpError)) {
        console.error(error);
        return json({ error: "internal error" }, 500);
    }
    return json(
        {
            error: error.message,
            ...(error instanceof ProviderStatusError ? { mondialRelay: error.provider } : {}),
        },
        error.status,
    );
}

export function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function queryText(url: URL, name: string): string | undefined {
    const value = url.searchParams.get(name)?.trim();
    return value || undefined;
}

export function requiredQuery(url: URL, name: string): string {
    const value = queryText(url, name);
    if (!value) {
        throw new HttpError(400, `${name} is required`);
    }
    return value;
}

export function limitParam(url: URL, fallback: number): number {
    const value = Number(url.searchParams.get("limit") ?? fallback);
    return Number.isInteger(value) && value > 0 && value <= 200 ? value : fallback;
}

export function offsetParam(url: URL): number {
    const value = Number(new URLSearchParams(url.search).get("offset") ?? 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
}
