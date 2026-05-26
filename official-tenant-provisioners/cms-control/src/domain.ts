import type { ProviderDomain } from "@bernouy/tenant-provisioner-sdk";

/**
 * The CMS tenant-provisioner exposes only provisioning + config + the SDK
 * discovery/admin surface. Its content API, admin UI and delivery layer stay
 * OUTSIDE the TP contract — the admin UI is a separate cookie-gated frontend
 * (like hub-ui ↔ hub-api), and public delivery is coupled to the edge/proxy
 * work that comes later. So the domain planes are intentionally empty here.
 */
export function makeCmsDomain(): ProviderDomain {
    return {
        mount() { /* no plane-2 / plane-3 routes yet */ },
        openapiConsumption: { openapi: "3.0.3", info: { title: "cms-control — consumption", version: "1" }, paths: {} },
        openapiTenant:      { openapi: "3.0.3", info: { title: "cms-control — tenant",      version: "1" }, paths: {} },
    };
}
