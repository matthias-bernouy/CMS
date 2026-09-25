import { ReleaseValidationError } from "cms-repository/exports/contracts/index";
import { ProviderInstallationValidationError } from "cms-repository/providers/installations/core/errors";
import { ProviderManifestValidationError } from "cms-repository/providers/manifests/core/errors";

export type ContractSelectionValidationCode =
    | "invalid_selection"
    | "limit_exceeded"
    | "duplicate_selection"
    | "cross_site_selection"
    | "installation_unavailable"
    | "manifest_mismatch"
    | "release_mismatch"
    | "yanked_dependency"
    | "missing_dependency"
    | "incompatible_dependency"
    | "dependency_cycle"
    | "revision_conflict"
    | "stale_dependencies";

export class ContractSelectionValidationError extends Error {
    readonly dependencyPath: readonly string[];

    constructor(
        readonly code: ContractSelectionValidationCode,
        message: string,
        readonly path = "$",
        dependencyPath: readonly string[] = [],
    ) {
        super(`${path}: ${message}${dependencyPath.length ? ` (${dependencyPath.join(" -> ")})` : ""}`);
        this.name = "ContractSelectionValidationError";
        this.dependencyPath = Object.freeze([...dependencyPath]);
    }
}

export function translateSelectionError(error: unknown): never {
    if (
        error instanceof ReleaseValidationError ||
        error instanceof ProviderManifestValidationError ||
        error instanceof ProviderInstallationValidationError
    ) {
        throw new ContractSelectionValidationError("invalid_selection", error.message, error.path);
    }
    throw error;
}
