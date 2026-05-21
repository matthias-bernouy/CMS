import { HubError, type HubErrorCode } from "./HubError";

/** HTTP status to return for each `HubErrorCode`. Single source of truth
 *  consumed by every handler that maps a `HubError` to a Response. */
export const HUB_ERROR_HTTP: Record<HubErrorCode, number> = {
    validation_error:                400,
    // Data-provider registry / cross-DP
    provider_unreachable:            502,
    provider_metadoc_invalid:        502,
    provider_does_not_trust_hub:     502,
    duplicate_provider_id:           409,
    provider_not_found:              404,
    provider_rejected_provisioning:  502,
    // Namespace registry
    namespace_not_found:             404,
    duplicate_namespace_id:          409,
    provision_not_found:             404,
    duplicate_provision:             409,
    tenant_not_found:                404,
    unknown:                         500,
};

/** Map a `HubError` to a `{ ok: false, error }` Response with the right status. */
export function hubErrorResponse(err: HubError): Response {
    return Response.json(
        { ok: false, error: { code: err.code, message: err.message } },
        { status: HUB_ERROR_HTTP[err.code] ?? 500 },
    );
}
