import {
    createProvider, MemoryTenantConfigStore, type LogStore,
} from "@bernouy/data-provider-sdk";
import { makeHooks } from "./hooks";
import { makeDomain } from "./domain";
import { ADDRESSES_TENANT_CONFIG } from "./tenantConfig";

/**
 * Addresses data-provider — wraps the French BAN (Base Adresse Nationale)
 * autocomplete + reverse-geocoding endpoints. Stateless: nothing per-tenant
 * is stored besides the per-tenant config (`maxSuggestions`). For v1 the
 * provider only serves French addresses.
 *
 * `logStore` is optional (default = persistent FileLogStore); tests inject
 * in-memory.
 */
export function makeAddresses(hubIssuer: string, logStore?: LogStore) {
    const tenantConfigStore = new MemoryTenantConfigStore();
    const provider = createProvider({
        config: {
            providerId:   "addresses-fr",
            providerKind: "addresses",
            allowlist:    [{ iss: hubIssuer, role: "control-plane" }],
        },
        hooks:        makeHooks(),
        domain:       makeDomain(tenantConfigStore),
        tenantConfig: { ...ADDRESSES_TENANT_CONFIG, store: tenantConfigStore },
        ...(logStore ? { store: logStore } : {}),
    });
    return { provider };
}
