import type { ProviderDomain } from "@bernouy/tenant-provisioner-sdk";

/**
 * V1: the Keycloak tenant-provisioner exposes only realm provisioning + config +
 * the SDK discovery/admin surface. No consumption / tenant planes yet (the
 * realm issuer URL is derived by convention — see `realmIssuerUrl`).
 */
export function makeKeycloakDomain(): ProviderDomain {
    return {
        mount() { /* no plane-2 / plane-3 routes yet */ },
        openapiConsumption: { openapi: "3.0.3", info: { title: "keycloak — consumption", version: "1" }, paths: {} },
        openapiTenant:      { openapi: "3.0.3", info: { title: "keycloak — tenant",      version: "1" }, paths: {} },
    };
}
