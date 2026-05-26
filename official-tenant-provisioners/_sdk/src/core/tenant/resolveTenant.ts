import type { AllowlistEntry } from "src/interfaces/ProviderConfig";
import type { TenantRegistry } from "src/interfaces/TenantRegistry";
import type { ResolvedIssuer } from "src/types/ResolvedIssuer";

/**
 * The (uncached) loader behind the state cache. Static allowlist wins (the
 * hub control-plane + any static entries), else the registry (provisioned
 * tenants, base.md §8). `null` ⇒ untrusted `iss`.
 */
export function makeIssuerLoader(
    allowlist: AllowlistEntry[],
    registry: TenantRegistry,
): (iss: string) => Promise<ResolvedIssuer | null> {
    const staticByIss = new Map(allowlist.map((e) => [e.iss, e.role] as const));

    return async function load(iss: string): Promise<ResolvedIssuer | null> {
        const staticRole = staticByIss.get(iss);
        if (staticRole) return { role: staticRole, tenant: null };

        const tenant = await registry.resolveByIssuer(iss);
        if (tenant) return { role: "tenant", tenant };

        return null;
    };
}
