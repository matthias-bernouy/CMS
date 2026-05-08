export type HubErrorCode =
    | "keycloak_unreachable"
    | "cms_unreachable"
    | "cdn_unreachable"
    | "provision_failed"
    | "deprovision_partial"
    | "validation_error"
    | "unknown";

/**
 * Surfaces failures from the multi-step orchestration. Wraps the underlying
 * client error (`cause`) so the operator can read the original
 * `KeycloakClientError` / `BucketsClientError` / `MtControlClientError`.
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
