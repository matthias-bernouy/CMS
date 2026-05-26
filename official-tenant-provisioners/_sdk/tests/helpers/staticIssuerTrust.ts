import type { AllowlistEntry } from "src/interfaces/ProviderConfig";
import type { IssuerTrust } from "src/interfaces/IssuerTrust";

/**
 * `IssuerTrust` over a static allowlist — test-only helper. Production wires
 * `createRegistryIssuerTrust` (allowlist + registry composite); a pure
 * static trust would skip every tenant resolution path and was never
 * intended for runtime use.
 */
export function staticIssuerTrust(allowlist: AllowlistEntry[]): IssuerTrust {
    const byIss = new Map(allowlist.map((e) => [e.iss, e.role] as const));
    return {
        async lookup(iss: string) {
            const role = byIss.get(iss);
            return role ? { role } : null;
        },
    };
}
