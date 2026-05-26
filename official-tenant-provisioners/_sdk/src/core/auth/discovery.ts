import {
    metadocPath, METADOC_VERSION_FIELD, sameOrigin, DISCOVERY_DEFAULTS,
} from "@bernouy/tenant-provisioner-contract";
import { AuthError } from "src/core/errors";
import { createTtlCache } from "src/core/ttlCache";

/** Parsed RFC 8414 metadoc (the fields the contract relies on). */
export interface IssuerMetadata {
    issuer:        string;
    jwksUri:       string;
    contractMajor: string;
}

function major(v: string): string {
    const m = String(v).split(".")[0];
    return m && /^\d+$/.test(m) ? m : "";
}

export interface DiscoveryDeps {
    /** Major version this provider accepts (from supportedContractVersion). */
    supportedMajor: string;
    now: () => number;          // epoch seconds
    /** Metadoc cache TTL (seconds). Default: `DISCOVERY_DEFAULTS.metadocTtlSeconds`. */
    ttlSeconds?: number;
    onSecurity?: (reason: string, ctx: Record<string, unknown>) => void;
}

/**
 * Discover + validate an issuer's metadoc (base.md §4.4 / §4.8). Enforces:
 * issuer == iss, jwks_uri & issuer same-origin as iss (anti-SSRF), and a
 * compatible `tenant_provisioner_contract_version`. Cached per iss with a TTL.
 */
export function createDiscovery(deps: DiscoveryDeps) {
    const ttl = deps.ttlSeconds ?? DISCOVERY_DEFAULTS.metadocTtlSeconds;

    // Shared TTL cache. `load` throws on bad/unreachable metadoc → nothing is
    // cached and the AuthError propagates. Only reached for trusted issuers
    // (verifyToken checks the allowlist first), so the size cap is academic.
    const cache = createTtlCache<IssuerMetadata>({
        now: deps.now,
        ttlSeconds: ttl,
        load: async (iss) => {
            const url = metadocPath(iss);   // shared: locks append convention vs issuer-kit
            let body: Record<string, unknown>;
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`status ${res.status}`);
                body = (await res.json()) as Record<string, unknown>;
            } catch (e) {
                deps.onSecurity?.("discovery_unreachable", { iss, err: String(e) });
                throw new AuthError();
            }

            const issuer = String(body["issuer"] ?? "");
            const jwksUri = String(body["jwks_uri"] ?? "");
            const dpcv = body[METADOC_VERSION_FIELD];

            if (issuer !== iss || !sameOrigin(jwksUri, iss) || !sameOrigin(issuer, iss)) {
                deps.onSecurity?.("ssrf_or_issuer_mismatch", { iss, issuer, jwksUri });
                throw new AuthError();
            }
            if (typeof dpcv !== "string" || major(dpcv) === "" || major(dpcv) !== deps.supportedMajor) {
                deps.onSecurity?.("contract_version_incompatible", { iss, dpcv });
                throw new AuthError();
            }
            return { issuer, jwksUri, contractMajor: major(dpcv) };
        },
    });

    return (iss: string): Promise<IssuerMetadata> => cache.get(iss);
}
