export class ClusterLogsError extends Error {
    constructor(readonly code: "INVALID_INPUT" | "INVALID_CURSOR" | "FORBIDDEN" | "NOT_FOUND" | "QUERY_TOO_LARGE") {
        super(code);
    }
}
export class ClusterSourceError extends Error {
    constructor(readonly status: "unavailable" | "unsupported" | "limit_exceeded") {
        super(status);
    }
}
