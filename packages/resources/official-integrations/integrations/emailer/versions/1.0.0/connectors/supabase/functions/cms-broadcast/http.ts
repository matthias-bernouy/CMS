import { HttpError, type JsonRecord } from "./types.ts";

export const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
}

export function optionsResponse(): Response {
    return new Response("ok", { headers: corsHeaders });
}

export function handleError(error: unknown): Response {
    if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
    }
    console.error(error);
    return json({ error: "internal error" }, 500);
}

export function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-broadcast";
    const index = pathname.indexOf(marker);
    if (index === -1) {
        return pathname || "/";
    }
    return pathname.slice(index + marker.length) || "/";
}

export async function withMethod(
    request: Request,
    method: string,
    handler: () => Promise<Response>,
): Promise<Response> {
    if (request.method !== method) {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: { ...corsHeaders, allow: `${method}, OPTIONS` },
        });
    }
    return handler();
}

export function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
