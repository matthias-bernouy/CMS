import { EVENT_CATALOG_VERSION } from "src/constants";

/**
 * Versioned event vocabulary (base.md §10). The power of standardization is
 * the **fixed** `event` set — the hub alerts/correlates identically across
 * all providers. Unknown `event` ⇒ the Recorder rejects (programming error).
 */
export const EVENT_CATALOG = new Set<string>([
    // security (kind: security)
    "auth.bearer_missing", "auth.alg_rejected", "auth.iss_untrusted",
    "auth.verify_failed", "auth.ssrf", "auth.contract_version",
    "auth.discovery_unreachable", "auth.iat_future", "auth.claims_shape",
    "auth.replay", "auth.unknown", "plane.denied", "tenant.suspended",
    // audit (kind: audit)
    "tenant.provision", "tenant.update", "tenant.deprovision",
    // request (kind: request)
    "request.served",
]);

export { EVENT_CATALOG_VERSION };

export function isKnownEvent(event: string): boolean {
    return EVENT_CATALOG.has(event);
}
