import type { ProviderHooks } from "@bernouy/tenant-provisioner-sdk";
import { KeycloakClientError } from "@bernouy/keycloak-client";
import type { KeycloakTenantConfig } from "./tenantConfig";

/** The subset of the Keycloak admin client the TP needs (so tests can inject
 *  a stub). `@bernouy/keycloak-client`'s `KeycloakAdminClient` satisfies it. */
export interface KeycloakRealmAdmin {
    createRealm(input: { realm: string; displayName?: string }): Promise<void>;
    updateRealm(realm: string, patch: { displayName?: string; enabled?: boolean }): Promise<void>;
    deleteRealm(realm: string): Promise<void>;
}

export interface KeycloakHooksOptions {
    client: KeycloakRealmAdmin;
}

const hasCode = (e: unknown, code: string): boolean =>
    e instanceof KeycloakClientError && e.code === code;

/**
 * Keycloak realm lifecycle hooks (base.md §8). **1 tenant = 1 realm** —
 * `tenantId` IS the realm name. The SDK owns auth / registry / audit / config
 * storage; these only reconcile the realm in Keycloak. All idempotent.
 */
export function makeKeycloakHooks(opts: KeycloakHooksOptions): ProviderHooks {
    const reconcile = async (realm: string, cfg: Partial<KeycloakTenantConfig>): Promise<void> => {
        if (cfg.displayName === undefined && cfg.enabled === undefined) return;
        await opts.client.updateRealm(realm, {
            ...(cfg.displayName !== undefined ? { displayName: cfg.displayName } : {}),
            ...(cfg.enabled     !== undefined ? { enabled:     cfg.enabled }     : {}),
        });
    };

    return {
        onProvision: async ({ tenantId, providerConfig }) => {
            const cfg = (providerConfig ?? {}) as Partial<KeycloakTenantConfig>;
            try {
                await opts.client.createRealm({
                    realm: tenantId,
                    ...(cfg.displayName ? { displayName: cfg.displayName } : {}),
                });
            } catch (e) {
                if (!hasCode(e, "conflict")) throw e;   // realm exists → idempotent
            }
            // Converge both fresh + already-existing realms to the desired config
            // (createRealm forces enabled:true, so `enabled:false` needs this).
            await reconcile(tenantId, cfg);
        },
        // Only the control-plane PATCH transports `providerConfig` to onUpdate.
        onUpdate: async ({ tenantId, patch }) => {
            if (patch.providerConfig === undefined) return;
            await reconcile(tenantId, patch.providerConfig as Partial<KeycloakTenantConfig>);
        },
        // `deleteRealm` wipes ALL users in the realm → force-only.
        onDeprovision: async ({ tenantId, force }) => {
            if (!force) return;
            try { await opts.client.deleteRealm(tenantId); }
            catch (e) { if (!hasCode(e, "not_found")) throw e; }   // already gone → ok
        },
    };
}
