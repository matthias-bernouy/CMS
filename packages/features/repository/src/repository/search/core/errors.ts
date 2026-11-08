export type RepositoryDiscoveryErrorCode =
    | "INVALID_INPUT"
    | "NOT_FOUND"
    | "RELEASE_MISMATCH"
    | "REVISION_CONFLICT"
    | "CATALOGUE_TOO_LARGE"
    | "CORE_UNAVAILABLE";

/** Business failures stay independent of HTTP status and Provider message localization. */
export class RepositoryDiscoveryError extends Error {
    constructor(
        readonly code: RepositoryDiscoveryErrorCode,
        message: string = code,
    ) {
        super(message);
        this.name = "RepositoryDiscoveryError";
    }
}
export function discoveryFailure(error: unknown): RepositoryDiscoveryError {
    return error instanceof RepositoryDiscoveryError ? error : new RepositoryDiscoveryError("CORE_UNAVAILABLE");
}
