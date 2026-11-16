import type { RepositoryFetch } from "@bernouy/repository/providers/http";
import { currentRequestHeaders } from "@bernouy/http-runner/observability";
import { retainResponseResource } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";

/** Preserve the active inbound correlation ID without coupling repository clients to HTTP runtime context. */
export function createCorrelatedRepositoryFetch(request: RepositoryFetch = fetch, logger?: Logger): RepositoryFetch {
    return async (url, init) => {
        const startedAt = performance.now();
        const attributes = { origin: url.origin, method: init.method ?? "GET", path: url.pathname };
        try {
            const response = await request(url, { ...init, headers: currentRequestHeaders(init.headers) });
            const headersMs = performance.now() - startedAt;
            logger?.info("repository.response.headers", {
                ...attributes,
                status: response.status,
                durationMs: headersMs,
            });
            if (!logger) {
                return response;
            }
            return retainResponseResource(
                response,
                () => {
                    logger.info("repository.response.released", {
                        ...attributes,
                        status: response.status,
                        headersMs,
                        durationMs: performance.now() - startedAt,
                    });
                },
                init.signal ?? undefined,
            );
        } catch (error) {
            logger?.warn("repository.request.failed", {
                ...attributes,
                durationMs: performance.now() - startedAt,
                timedOut: error instanceof DOMException && error.name === "TimeoutError",
            });
            throw error;
        }
    };
}
