const JSON_HEADERS = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
};

export function managementUnauthorized(): Response {
    return errorResponse(401, "Repository management authentication is required", "management_unauthorized", {
        "www-authenticate": 'Bearer realm="cms-repository-management"',
    });
}

export function managementRateLimited(retryAfterSeconds: number): Response {
    const retryAfter = normalizeRetryAfter(retryAfterSeconds);
    return errorResponse(
        429,
        "Repository management rate limit exceeded",
        "management_rate_limited",
        { "retry-after": String(retryAfter) },
        { retryAfterSeconds: retryAfter },
    );
}

export function managementProtectionUnavailable(): Response {
    return errorResponse(503, "Repository management protection is unavailable", "management_protection_unavailable");
}

function errorResponse(
    status: number,
    error: string,
    code: string,
    headers: Readonly<Record<string, string>> = {},
    metadata: Readonly<Record<string, unknown>> = {},
): Response {
    return new Response(JSON.stringify({ error, code, ...metadata }), {
        status,
        headers: { ...JSON_HEADERS, ...headers },
    });
}

function normalizeRetryAfter(value: number): number {
    return Number.isFinite(value) ? Math.max(1, Math.ceil(value)) : 1;
}
