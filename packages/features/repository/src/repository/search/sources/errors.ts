import { RepositoryHttpError, RepositoryResponseTooLargeError } from "repository/repository-http/errors";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { RepositoryDiscoveryError } from "../core/errors";
import type { RepositoryDiscoveryErrorCode } from "../core/errors";

export function discoveryTransportFailure(error: unknown, operation: "search" | "read"): RepositoryDiscoveryError {
    if (error instanceof RepositoryDiscoveryError) {
        return error;
    }
    if (error instanceof RepositoryResponseTooLargeError) {
        return new RepositoryDiscoveryError("CATALOGUE_TOO_LARGE");
    }
    if (error instanceof RepositoryHttpError) {
        if (error.body) {
            try {
                const value = parseStrictJson(error.body, 4096, 8) as { error?: { code?: string } };
                const code = value?.error?.code;
                if (
                    [
                        "INVALID_INPUT",
                        "RELEASE_MISMATCH",
                        "REVISION_CONFLICT",
                        "CATALOGUE_TOO_LARGE",
                        "CORE_UNAVAILABLE",
                    ].includes(code ?? "")
                ) {
                    return new RepositoryDiscoveryError(code as RepositoryDiscoveryErrorCode);
                }
            } catch {
                // Invalid remote diagnostics never become public error text.
            }
        }
        if (error.status === 404 && operation === "read") {
            return new RepositoryDiscoveryError("NOT_FOUND");
        }
        if (error.status === 409) {
            return new RepositoryDiscoveryError("REVISION_CONFLICT");
        }
        if (error.status === 422) {
            return new RepositoryDiscoveryError("INVALID_INPUT");
        }
    }
    return new RepositoryDiscoveryError("CORE_UNAVAILABLE");
}
