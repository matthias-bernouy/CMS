import type { ProviderHooks } from "@bernouy/tenant-provisioner-sdk";

/** No-op hooks — the addresses TP is stateless (proxy to BAN, no per-tenant
 *  storage). Tenant lifecycle just acks the calls so the SDK registry
 *  updates cleanly; `force` deprovision has nothing to delete. */
export function makeHooks(): ProviderHooks {
    return {
        onProvision:   async () => { /* stateless */ },
        onUpdate:      async () => { /* stateless */ },
        onDeprovision: async () => { /* stateless */ },
    };
}
