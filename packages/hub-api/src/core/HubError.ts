export type HubErrorCode =
    | "validation_error"
    // Data-provider registry / cross-DP provisioning
    | "provider_unreachable"
    | "provider_metadoc_invalid"
    | "provider_does_not_trust_hub"
    | "duplicate_provider_id"
    | "provider_not_found"
    | "provider_rejected_provisioning"
    // Namespace registry (post-pivot — replaces tenant identity)
    | "namespace_not_found"
    | "duplicate_namespace_id"
    | "provision_not_found"
    | "duplicate_provision"
    | "tenant_not_found"   // ← still used: the DP returned 404 on a known namespace
    | "unknown";

/**
 * Surfaces failures from the orchestration. Wraps the underlying client
 * error (`cause`) so the operator can read the original error (e.g. the
 * network error from a data-provider fetch) in the logs.
 */
export class HubError extends Error {

    public readonly code: HubErrorCode;
    public override readonly cause?: unknown;

    constructor(code: HubErrorCode, message: string, cause?: unknown) {
        super(message);
        this.name = "HubError";
        this.code = code;
        if (cause !== undefined) this.cause = cause;
    }
}
