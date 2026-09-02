import { HttpError } from "./errors.ts";

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
        },
    });
}

export async function withMethod(
    request: Request,
    method: string,
    handler: () => Promise<Response>,
): Promise<Response> {
    if (request.method !== method) {
        return json({ error: "method not allowed" }, 405);
    }
    return handler();
}

export function handleError(error: unknown): Response {
    if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
    }
    return json({ error: "internal error" }, 500);
}
