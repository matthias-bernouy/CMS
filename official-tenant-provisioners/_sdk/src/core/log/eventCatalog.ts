import { EVENT_CATALOG_VERSION } from "src/constants";

/**
 * Versioned event vocabulary (base.md §10). The CORE set below is **fixed**
 * so the hub alerts/correlates identically across every provider, and a
 * provider can never impersonate a core event.
 *
 * A provider extends it with its OWN business events under the reserved
 * **`domain.` prefix** (`domain.<name>`, e.g. `domain.deploy_published`,
 * `domain.rate_limit_tripped`). These:
 *   - can't collide with / fake a core event (different prefix),
 *   - are disambiguated hub-side by `(providerId, event)`,
 *   - may use ANY `kind` — the provider picks the lane by semantics: a
 *     compliance-relevant action as durable `audit`, a business security
 *     signal as `security` (surfaced to the hub's security stream), volume
 *     telemetry as `request`. The hub's generic correlation keys on core
 *     event NAMES, so `domain.*` never trips a core rule — it just shows in
 *     the per-provider stream.
 *
 * Any other unknown `event` ⇒ the Recorder rejects (programming error).
 * Trade-off: `domain.*` is open (no per-name declaration) so typos aren't
 * caught — the names are the provider's own and surface in its own logs.
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

/** Reserved prefix for provider-specific (business) events. */
export const DOMAIN_EVENT_PREFIX = "domain.";

export { EVENT_CATALOG_VERSION };

export function isKnownEvent(event: string): boolean {
    return EVENT_CATALOG.has(event) || event.startsWith(DOMAIN_EVENT_PREFIX);
}
