import { HttpError, ProviderHttpError } from "./errors.ts";

const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-user-id, x-cms-user-id, x-cms-user-role",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

export async function withMethod(
    request: Request,
    method: string,
    handler: () => Promise<Response>,
): Promise<Response> {
    if (request.method !== method) {
        return methodNotAllowed(`${method}, OPTIONS`);
    }
    return handler();
}

function methodNotAllowed(allow: string): Response {
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...corsHeaders, allow },
    });
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
    if (error instanceof ProviderHttpError) {
        return json({ error: "provider request failed" }, 502);
    }
    if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
    }
    console.error(error);
    return json({ error: "internal error" }, 500);
}
