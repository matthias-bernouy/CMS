import { HttpError } from "./errors.ts";

export const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

export function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
}

export function optionsResponse(): Response {
    return new Response("ok", { headers: corsHeaders });
}

export function methodNotAllowed(...methods: string[]): Response {
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...corsHeaders, allow: [...methods, "OPTIONS"].join(", ") },
    });
}

export function handleError(error: unknown): Response {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "internal error" }, 500);
}
