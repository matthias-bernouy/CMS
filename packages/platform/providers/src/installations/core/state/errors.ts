export type ProviderInstallationWorkflowCode =
    | "installation_not_found"
    | "installation_exists"
    | "revision_conflict"
    | "installation_revoked"
    | "identity_change"
    | "manifest_unavailable"
    | "stale_timestamp"
    | "invalid_preparation"
    | "retention_unknown"
    | "release_in_use";

export class ProviderInstallationWorkflowError extends Error {
    constructor(
        readonly code: ProviderInstallationWorkflowCode,
        message: string,
    ) {
        super(message);
        this.name = "ProviderInstallationWorkflowError";
    }
}
