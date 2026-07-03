import { HttpError } from "./errors.ts";

export const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

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
    return await handler();
}

export function optionsResponse(): Response {
    return new Response("ok", { headers: corsHeaders });
}

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            "content-type": "application/json; charset=utf-8",
        },
    });
}

export function handleError(error: unknown): Response {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "internal error" }, 500);
}
