import type { ProviderHooks } from "@bernouy/data-provider-sdk";

/** No-op hooks — the addresses DP is stateless (proxy to BAN, no per-tenant
 *  storage). Tenant lifecycle just acks the calls so the SDK registry
 *  updates cleanly; `force` deprovision has nothing to delete. */
export function makeHooks(): ProviderHooks {
    return {
        onProvision:   async () => { /* stateless */ },
        onUpdate:      async () => { /* stateless */ },
        onDeprovision: async () => { /* stateless */ },
    };
}
