import type { KeyStore } from "@bernouy/issuer-kit";
import type { DataProviderImportsRepository } from "./DataProviderImportsRepository";
import type { NamespaceRepository } from "./NamespaceRepository";

/**
 * Hub configuration — post-pivot. The hub no longer creates Keycloak realms,
 * SMTP-bound OIDC clients, or admin users. It just :
 *   - hosts a `ControlPlaneIssuer` to mint CP tokens against the DPs (D5),
 *   - keeps a meta-registry of imported DPs (D2),
 *   - keeps a meta-registry of namespaces + their per-DP provisions (D-post-pivot).
 *
 * Authentication of the `/admin/*` superadmin UI is done via the consumer-
 * provided `Authentication` instance passed to `mountHubApi` / `mountHubUi`.
 * The hub never touches Keycloak admin APIs.
 */
export type HubConfig = {
    /** §5 — the hub is itself an issuer in the data-provider trust graph. */
    issuer: {
        /** Public URL of THIS hub. Will be served as `iss` in its metadoc. */
        baseUrl:  string;
        /** Signing-key storage. Inject e.g. `FileKeyStore` for prod,
         *  `MemoryKeyStore` for tests. */
        keyStore: KeyStore;
    };
    /** §11 — meta-registry of imported data-providers (D2). Defaults to
     *  in-memory (lost on restart — dev / tests only). Inject the Mongo
     *  variant in prod. */
    imports?:    DataProviderImportsRepository;
    /** Registry of namespaces + their per-DP provisions. Memory by default,
     *  Mongo in prod. */
    namespaces?: NamespaceRepository;
    /** Optional fetch implementation (overrideable for tests). */
    fetch?:      typeof fetch;
};
