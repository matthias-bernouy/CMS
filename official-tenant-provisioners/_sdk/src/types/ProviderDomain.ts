import type { Runner } from "@bernouy/core";

/**
 * What the provider supplies for planes 2 & 3 (base.md §1.1/§9). The SDK
 * owns plane 1 + the 4 fixed endpoints + the middleware; the provider only
 * registers its tenant-admin / consumption routes (already behind the
 * verified middleware) and ships the two non-admin OpenAPI docs.
 *
 * Handlers MUST read the verified context via `requestContext(req)` — they
 * never see the raw JWT and never re-check auth/plane (the SDK did it).
 */
export interface ProviderDomain {
    /** Register plane-2 (`/tenant/*`) + plane-3 (root) routes. */
    mount(runner: Runner): void;
    /** Served verbatim at `/openapi.json` (plane 3, public). */
    openapiConsumption: unknown;
    /** Served verbatim at `/openapi.tenant.json` (plane 2, public). */
    openapiTenant: unknown;
}
