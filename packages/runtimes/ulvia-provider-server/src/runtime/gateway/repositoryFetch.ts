import type { RepositoryFetch } from "@bernouy/cms-repository/providers/http";
import { currentRequestHeaders } from "@bernouy/http-runner/observability";

/** Preserve the active inbound correlation ID without coupling repository clients to HTTP runtime context. */
export function createCorrelatedRepositoryFetch(request: RepositoryFetch = fetch): RepositoryFetch {
    return (url, init) => {
        return request(url, { ...init, headers: currentRequestHeaders(init.headers) });
    };
}

export const correlatedRepositoryFetch = createCorrelatedRepositoryFetch();
