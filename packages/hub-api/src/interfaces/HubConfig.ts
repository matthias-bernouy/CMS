import type { SmtpConfig } from "@bernouy/keycloak-client";
import type { BucketLimits, BucketQuotas } from "@bernouy/cdn-buckets";

/** Bucket settings applied to every bucket created by the hub. */
export type BucketDefaults = {
    cacheControl: string;
    quotas:       BucketQuotas;
    limits:       BucketLimits;
};

export type HubConfig = {
    keycloak: {
        /** Keycloak base URL — no `/admin`, no trailing slash. */
        baseUrl:           string;
        /** Realm hosting the hub's service-account client. Typically `master`. */
        adminRealm:        string;
        /** Service account client id. Typically `hub-orchestrator`. */
        adminClientId:     string;
        adminClientSecret: string;
    };
    cms: {
        /** Public URL of the cms-control-mt instance, e.g. `https://cms.bernouy.com`.
         *  Reused as the redirect-URI base when registering each tenant's Keycloak client. */
        baseUrl: string;
    };
    cdn: {
        /** Origin admin URL (e.g. `https://cdn-origin.bernouy.com`). */
        baseUrl:    string;
        /** Edges public host the CMS will use to serve files (e.g. `https://cdn.bernouy.com`).
         *  Bucket URLs become `${publicHost}/${bucketId}/<file>`. */
        publicHost: string;
    };
    /** SMTP credentials applied to every created realm so the welcome magic link can be delivered. */
    smtp:           SmtpConfig;
    /** Override the default bucket settings (cacheControl, quotas, limits) globally for this hub. */
    bucketDefaults?: Partial<BucketDefaults>;
    /** Optional fetch implementation (overrideable for tests). */
    fetch?:          typeof fetch;
};
