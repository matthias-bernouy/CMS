const JSON_HEADERS = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
} as const;

export function repositoryManagementUnavailableResponse(): Response {
    return repositoryManagementJsonResponse(503, {
        code: "repository_management_unavailable",
        error: "Integration repository management is unavailable",
    });
}

export function repositoryManagementUploadTooLargeResponse(): Response {
    return repositoryManagementJsonResponse(413, {
        code: "management_package_upload_too_large",
        error: "Integration package upload is too large",
    });
}

export function repositoryManagementJsonResponse(status: number, body: unknown, retryAfter?: string): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...JSON_HEADERS,
            ...(retryAfter ? { "retry-after": retryAfter } : {}),
        },
    });
}
