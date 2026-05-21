import type { ControlPlaneIssuer } from "@bernouy/issuer-kit";

/**
 * Returns a fresh CP token for the given providerId. NO caching — the SDK's
 * verifier (base.md §4.5) enforces strict JTI replay protection on every
 * control-plane request, so re-using the same token against the same DP
 * within its TTL is rejected. Each hub→DP call mints a new token.
 */
export function createCpTokenFor(opts: { issuer: ControlPlaneIssuer }) {
    return async function cpTokenFor(providerId: string): Promise<string> {
        return opts.issuer.mint({ aud: providerId });
    };
}

export type CpTokenFor = ReturnType<typeof createCpTokenFor>;
