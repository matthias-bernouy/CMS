import {
    metadocPath, DATA_PROVIDER_CONTRACT_VERSION,
} from "@bernouy/data-provider-contract";
import { HubError } from "src/core/HubError";
import type { DataProviderImport } from "src/interfaces/DataProviderImport";

type FetchFn = typeof fetch;
type Json    = Record<string, unknown>;

interface DiscoverResult {
    providerId:    string;
    providerKind?: string;
    iss:           string;
    schemas:       DataProviderImport["schemas"];
}

export function normalizeUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

/** Per-fetch timeout for discovery — a hanging DP must not stall the import
 *  request indefinitely. Each fetch gets its own fresh `AbortSignal`. */
const DISCOVERY_TIMEOUT_MS = 5_000;
const withTimeout = (init?: RequestInit): RequestInit =>
    ({ ...init, signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });

const msg = (e: unknown): string => e instanceof Error ? e.message : String(e);

/** Fetch + parse a JSON doc. `onStatus` lets the caller map non-2xx to a
 *  specific HubError (e.g. 401/403 → provider_does_not_trust_hub). */
async function fetchJson(
    f: FetchFn, url: string, init: RequestInit | undefined,
    onStatus?: (status: number) => HubError | null,
): Promise<Json> {
    let r: Response;
    try { r = await f(url, init); }
    catch (e) { throw new HubError("provider_unreachable", `failed to fetch ${url}: ${msg(e)}`, e); }
    if (!r.ok) {
        const mapped = onStatus?.(r.status);
        if (mapped) throw mapped;
        throw new HubError("provider_unreachable", `failed to fetch ${url}: status ${r.status}`);
    }
    return (await r.json()) as Json;
}

/**
 * Fetch + validate the 4 discovery documents of a data-provider, given its
 * base URL. Returns the data the hub needs to persist.
 *
 * Order: data-provider-info → RFC 8414 metadoc → JWKS → openapi.admin (CP)
 *      → openapi.tenant-config (CP, optional 404).
 */
export async function discoverEndpoints(opts: {
    url:     string;
    fetch?:  FetchFn;
    mintCp:  (providerId: string) => Promise<string>;
}): Promise<DiscoverResult> {
    const url = normalizeUrl(opts.url);
    const f   = opts.fetch ?? fetch;

    const info = await fetchJson(f, `${url}/.well-known/data-provider-info`, withTimeout());
    const providerId    = String(info["providerId"] ?? "");
    const providerKind  = typeof info["providerKind"] === "string" ? info["providerKind"] as string : undefined;
    const contractMajor = String(info["contractVersion"] ?? "").split(".")[0] ?? "";
    if (!providerId) {
        throw new HubError("provider_metadoc_invalid", `data-provider-info at ${url} missing providerId`);
    }
    if (contractMajor !== DATA_PROVIDER_CONTRACT_VERSION.split(".")[0]) {
        throw new HubError("provider_metadoc_invalid",
            `data-provider at ${url} declares contractVersion=${info["contractVersion"]}, hub speaks ${DATA_PROVIDER_CONTRACT_VERSION} — major mismatch`);
    }

    const metadoc = await fetchJson(f, metadocPath(url), withTimeout());
    const iss     = String(metadoc["issuer"] ?? "");
    const jwksUri = String(metadoc["jwks_uri"] ?? "");
    if (!iss || !jwksUri) {
        throw new HubError("provider_metadoc_invalid", `metadoc at ${url} missing issuer/jwks_uri`);
    }
    if (iss !== url) {
        throw new HubError("provider_metadoc_invalid", `metadoc.issuer (${iss}) does not match the URL (${url})`);
    }
    // Anti-SSRF: `jwks_uri` is remote-controlled (it comes from the DP metadoc),
    // so it must stay same-origin as the DP — otherwise a hostile/typo'd DP
    // could point the hub at an internal address (cloud metadata, etc.).
    let jwksOrigin: string;
    try { jwksOrigin = new URL(jwksUri).origin; }
    catch { throw new HubError("provider_metadoc_invalid", `metadoc.jwks_uri (${jwksUri}) is not a valid URL`); }
    if (jwksOrigin !== new URL(url).origin) {
        throw new HubError("provider_metadoc_invalid",
            `metadoc.jwks_uri (${jwksUri}) is not same-origin as ${url}`);
    }

    const jwks = await fetchJson(f, jwksUri, withTimeout());

    const onAuth = (status: number) => (status === 401 || status === 403)
        ? new HubError("provider_does_not_trust_hub",
            `${url} refused the hub's CP token. Ensure the DP's allowlist contains { iss: <hub.iss>, role: "control-plane" }.`)
        : null;

    // Mint a fresh CP token for each CP-gated fetch — the SDK enforces strict
    // JTI replay protection (base.md §4.5), so the same token cannot be used
    // twice against the same DP. `mintCp` is expected to return a fresh token
    // each call here (importDataProvider/refreshDataProvider pass an uncached
    // mint function for this reason).
    const adminAuth = { Authorization: `Bearer ${await opts.mintCp(providerId)}` };
    const openapiAdmin = await fetchJson(f, `${url}/openapi.admin.json`, withTimeout({ headers: adminAuth }), onAuth);

    const tcAuth = { Authorization: `Bearer ${await opts.mintCp(providerId)}` };
    let tenantConfig:        Json   | undefined;
    let tenantConfigVersion: string | undefined;
    try {
        const r = await f(`${url}/openapi.tenant-config.json`, withTimeout({ headers: tcAuth }));
        if (r.status === 200) {
            tenantConfig = (await r.json()) as Json;
            const v = tenantConfig["version"];
            if (typeof v === "string") tenantConfigVersion = v;
        }
        // 404 / 401 / other → provider has no tenantConfig (or rejected),
        // leave undefined.
    } catch { /* tolerate transient — same as 404 */ }

    return {
        providerId,
        ...(providerKind ? { providerKind } : {}),
        iss,
        schemas: {
            info, metadoc, jwks, openapiAdmin,
            ...(tenantConfig        ? { tenantConfig }        : {}),
            ...(tenantConfigVersion ? { tenantConfigVersion } : {}),
        },
    };
}
