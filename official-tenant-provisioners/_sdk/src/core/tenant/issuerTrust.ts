import type { AllowlistEntry } from "src/interfaces/ProviderConfig";
import type { TenantRegistry } from "src/interfaces/TenantRegistry";
import type { IssuerTrust } from "src/interfaces/IssuerTrust";
import type { ResolvedIssuer } from "src/types/ResolvedIssuer";
import { createStateCache, type StateCache } from "src/core/tenant/stateCache";
import { makeIssuerLoader } from "src/core/tenant/resolveTenant";

/**
 * Composite issuer trust: static allowlist ∪ registry, behind one bounded
 * state cache (§5). Exposes both the thin `IssuerTrust` (for `verifyToken`,
 * role only) and the rich `resolve` (full ResolvedIssuer, for the middleware
 * to build ProviderContext + suspend check) — sharing one cache so a request
 * pays at most one resolution.
 */
export interface RegistryIssuerTrust {
    trust: IssuerTrust;
    resolve(iss: string): Promise<ResolvedIssuer | null>;
    cache: StateCache;
}

export function createRegistryIssuerTrust(opts: {
    allowlist:  AllowlistEntry[];
    registry:   TenantRegistry;
    now:        () => number;
    ttlSeconds: number;
}): RegistryIssuerTrust {
    const cache = createStateCache({
        now: opts.now,
        ttlSeconds: opts.ttlSeconds,
        load: makeIssuerLoader(opts.allowlist, opts.registry),
    });
    return {
        cache,
        resolve: (iss) => cache.get(iss),
        trust: {
            async lookup(iss) {
                const r = await cache.get(iss);
                return r ? { role: r.role } : null;
            },
        },
    };
}
