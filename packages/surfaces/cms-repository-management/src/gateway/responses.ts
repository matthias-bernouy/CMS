const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after"] as const;

export function gatewayError(status: number, code: string, error: string): Response {
    return Response.json(
        { code, error },
        {
            status,
            headers: { "cache-control": "no-store" },
        },
    );
}

export function sanitizedGatewayResponse(upstream: Response): Response {
    const headers = new Headers({ "cache-control": "no-store" });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }
    return new Response(upstream.body, { status: upstream.status, headers });
}
