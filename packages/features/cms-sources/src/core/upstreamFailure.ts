export type UndeclaredUpstreamStatus = {
    correlationId: string;
    endpointUrn: string;
    kind: "undeclared_upstream_status";
    upstreamStatus: number;
};

export type SafeUpstreamFailureResponseOptions = {
    omitBody?: boolean;
};

export function safeUpstreamFailureResponse(
    correlationId: string,
    options: SafeUpstreamFailureResponseOptions = {},
): Response {
    const body = options.omitBody
        ? null
        : JSON.stringify({ error: "Upstream request failed", correlationId });
    return new Response(body, {
        status: 502,
        headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
            "x-content-type-options": "nosniff",
            "x-correlation-id": correlationId,
        },
    });
}
