import {
    createProvider, MemoryTenantConfigStore,
    type LogStore, type Provider, type TenantConfigStore,
} from "@bernouy/tenant-provisioner-sdk";
import { makeKeycloakHooks, type KeycloakRealmAdmin } from "./hooks";
import { makeKeycloakDomain } from "./domain";
import { KEYCLOAK_TENANT_CONFIG } from "./tenantConfig";
import { DEFAULT_KEYCLOAK_PROVIDER_ID, realmIssuerUrl } from "./constants";

export interface CreateKeycloakProviderOptions {
    /** Admin client for the target Keycloak (a `KeycloakAdminClient`). */
    client: KeycloakRealmAdmin;
    /** Issuer URL the hub mints control-plane tokens under (allowlisted). */
    hubIssuer: string;
    /** Keycloak base URL — used to surface each realm's issuer URL
     *  (`<base>/realms/<tenantId>`) via the tenant-info endpoint. */
    keycloakBaseUrl: string;
    /** Defaults to `"keycloak"`. */
    providerId?: string;
    /** Where the §11 config is persisted. Default in-memory — note the realm
     *  in Keycloak is the AUTHORITATIVE state; this only mirrors the hub's
     *  last-set view. */
    tenantConfigStore?: TenantConfigStore;
    logStore?: LogStore;
    logDir?:   string;
}

/**
 * Keycloak as a conforming tenant-provisioner: the hub imports it and provisions
 * one **realm per tenant** (`tenantId` = realm name), with displayName/enabled
 * config. Everything in base.md (auth, planes, provisioning, logs, RFC 7807,
 * OpenAPI, §11 config) comes from the SDK; this wires the realm hooks.
 */
export function createKeycloakProvider(opts: CreateKeycloakProviderOptions): Provider {
    return createProvider({
        config: {
            providerId: opts.providerId ?? DEFAULT_KEYCLOAK_PROVIDER_ID,
            allowlist:  [{ iss: opts.hubIssuer, role: "control-plane" }],
        },
        hooks:        makeKeycloakHooks({ client: opts.client }),
        domain:       makeKeycloakDomain(),
        tenantConfig: { ...KEYCLOAK_TENANT_CONFIG, store: opts.tenantConfigStore ?? new MemoryTenantConfigStore() },
        // Surface the realm's OIDC issuer URL (NOT the issuer-kit signing issuer)
        // so the operator can wire it into other TPs' trusted-issuer lists.
        tenantInfo: async ({ tenantId }) => ({
            fields: [{ label: "Realm issuer", value: realmIssuerUrl(opts.keycloakBaseUrl, tenantId), kind: "url" }],
        }),
        ...(opts.logStore ? { store: opts.logStore } : opts.logDir ? { logDir: opts.logDir } : {}),
    });
}

export { KEYCLOAK_TENANT_CONFIG } from "./tenantConfig";
export type { KeycloakTenantConfig } from "./tenantConfig";
export { makeKeycloakHooks } from "./hooks";
export type { KeycloakHooksOptions, KeycloakRealmAdmin } from "./hooks";
export { DEFAULT_KEYCLOAK_PROVIDER_ID, realmIssuerUrl } from "./constants";
