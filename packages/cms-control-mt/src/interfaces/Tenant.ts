// One row in the platform's tenant registry. Each tenant brings its own
// Keycloak realm + CDN bucket; the data layer is the shared Mongo Db with
// per-tenant collection prefix (see `mountTenant`).

export type TenantKeycloak = {
    issuer:        string;
    clientId:      string;
    clientSecret:  string;
    sessionSecret: string;
    adminRole:     string;
    /** Public client used by the `p9r login` Device Authorization Grant. */
    cliClientId?:  string;
};

export type TenantCdnBucket = {
    /** Origin of the CDN provider (frontier B), e.g. `https://cdn.example.com`. */
    url:              string;
    /** Bucket-credential bearer held server-side; never reaches the browser. */
    bucketCredential: string;
};

export type TenantDelivery = {
    /** Bucket the Delivery cron writes rendered HTML, image variants, bundles and CSS into. */
    publicCdn: TenantCdnBucket;
    /** Optional public host (`acme.com`) — used when rewriting absolute URLs in pages. */
    alias?: string;
    /**
     * When `false` (or missing), the Delivery cron skips this tenant. Lets
     * superadmin onboard the bucket config ahead of cutover, then flip on
     * once DNS is wired and the first build looks sane.
     */
    enabled?: boolean;
    /**
     * Set by `ControlCms` admin actions (page save, bloc deploy, …) so the
     * Delivery cron knows the tenant has changes to flush. Cleared by
     * Delivery once a build covers `>= dirtyAt`.
     */
    dirtyAt?: Date;
};

export type Tenant = {
    /** URL-safe slug, also the `clientID` displayed in the superadmin UI. */
    id:        string;
    name:      string;
    createdAt: Date;
    updatedAt: Date;
    keycloak:  TenantKeycloak;
    /** Bucket where Control admin uploads land. */
    assetsCdn: TenantCdnBucket;
    /** Optional Delivery wiring — fillable later, opt-in via `enabled`. */
    delivery?: TenantDelivery;
};
