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

export type Tenant = {
    /** URL-safe slug, also the `clientID` displayed in the superadmin UI. */
    id:        string;
    name:      string;
    createdAt: Date;
    updatedAt: Date;
    keycloak:  TenantKeycloak;
    /**
     * Bucket where Control admin uploads land. The future Delivery layer
     * will use a separate `public` bucket — left out of this contract on
     * purpose so the structure can grow without a migration.
     */
    assetsCdn: TenantCdnBucket;
};
