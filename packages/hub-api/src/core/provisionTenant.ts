import type { BucketsClient } from "@bernouy/cdn-buckets";
import type { MtControlClient } from "@bernouy/mt-cms-control";
import type { KeycloakAdminClient } from "@bernouy/keycloak-client";
import type { HubConfig, BucketDefaults } from "src/interfaces/HubConfig";
import type { ProvisionTenantInput, ProvisionTenantResult } from "src/core/schemas/provisionTenant";

const DEFAULT_BUCKET_DEFAULTS: BucketDefaults = {
    cacheControl: "public, max-age=31536000, immutable",
    quotas:       { maxTotalSize: 10 * 1024 * 1024 * 1024, maxFileCount: 10000 },
    limits:       { maxFileSize: 100 * 1024 * 1024, acceptedMimeTypes: "*" },
};

/**
 * The 12-step provisioning recipe. Pure orchestration — clients are passed in
 * (instantiated by the `Hub` composition root). On any throw, the caller (`Hub`)
 * runs `deprovisionTenant` for best-effort cleanup before re-throwing.
 */
export async function provisionTenant(opts: {
    keycloak: KeycloakAdminClient;
    cms:      MtControlClient;
    cdn:      BucketsClient;
    config:   HubConfig;
    input:    ProvisionTenantInput;
}): Promise<ProvisionTenantResult> {
    const { keycloak, cms, cdn, config, input } = opts;
    const slug             = input.slug;
    const cmsBaseUrl       = config.cms.baseUrl;
    const adminRoleName    = "admin";
    const cmsClientId      = "cms";
    const cmsCliClientId   = "cms-cli";
    const assetsBucketId   = `${slug}-assets`;
    const deliveryBucketId = `${slug}-delivery`;
    const wantsDelivery    = input.deliveryEnabled === true || input.publicAlias !== undefined;

    // 1. realm + SMTP for the welcome email
    await keycloak.createRealm({ realm: slug, displayName: input.name, smtp: config.smtp });

    // 2. confidential client for the CMS web (returns the secret)
    const { clientSecret } = await keycloak.createConfidentialClient(slug, {
        clientId:               cmsClientId,
        redirectUris:           [`${cmsBaseUrl}/cms/${slug}/auth/callback`],
        postLogoutRedirectUris: [`${cmsBaseUrl}/cms/${slug}/auth/post-logout-callback`],
        webOrigins:             [cmsBaseUrl],
    });

    // 3. public client for `p9r` device flow
    await keycloak.createPublicClient(slug, {
        clientId:                              cmsCliClientId,
        standardFlowEnabled:                   false,
        oauth2DeviceAuthorizationGrantEnabled: true,
    });

    // 4. realm role
    await keycloak.createRealmRole(slug, { name: adminRoleName, description: `${input.name} admin` });

    // 5-7. user + role + magic link
    const userId = await keycloak.createUser(slug, {
        username: input.adminUser.username,
        email:    input.adminUser.email,
        ...(input.adminUser.firstName !== undefined ? { firstName: input.adminUser.firstName } : {}),
        ...(input.adminUser.lastName  !== undefined ? { lastName:  input.adminUser.lastName  } : {}),
        enabled:  true,
    });
    await keycloak.assignRealmRoleToUser(slug, userId, adminRoleName);
    await keycloak.sendActionsEmail(slug, userId, ["UPDATE_PASSWORD", "VERIFY_EMAIL"], {
        clientId: cmsClientId,
        lifespan: input.welcomeLinkLifespanSeconds ?? 7 * 24 * 3600,
        ...(input.welcomeRedirectUri ? { redirectUri: input.welcomeRedirectUri } : {}),
    });

    // 8-9. CDN assets bucket + credential
    const bucketCfg = mergeBucketDefaults(config.bucketDefaults, input.bucketOverrides);
    await cdn.createBucket({ id: assetsBucketId, ...bucketCfg });
    const { cleartextToken: assetsBucketCred } = await cdn.createBucketCredential(assetsBucketId, { label: `cms-${slug}` });

    // 10-11. Optional: delivery bucket + credential
    let deliveryBucketCred: string | undefined;
    if (wantsDelivery) {
        await cdn.createBucket({ id: deliveryBucketId, ...bucketCfg });
        const r = await cdn.createBucketCredential(deliveryBucketId, { label: `delivery-${slug}` });
        deliveryBucketCred = r.cleartextToken;
    }

    // 12. CMS tenant
    await cms.createTenant({
        id:   slug,
        name: input.name,
        keycloak: {
            issuer:        `${config.keycloak.baseUrl}/realms/${slug}`,
            clientId:      cmsClientId,
            clientSecret,
            sessionSecret: generateSessionSecret(),
            adminRole:     adminRoleName,
            cliClientId:   cmsCliClientId,
        },
        assetsCdn: {
            url:              `${config.cdn.publicHost}/${assetsBucketId}`,
            bucketCredential: assetsBucketCred,
        },
        ...(wantsDelivery && deliveryBucketCred ? {
            delivery: {
                publicCdn: { url: `${config.cdn.publicHost}/${deliveryBucketId}`, bucketCredential: deliveryBucketCred },
                ...(input.publicAlias     !== undefined ? { alias:   input.publicAlias }     : {}),
                ...(input.deliveryEnabled !== undefined ? { enabled: input.deliveryEnabled } : {}),
            },
        } : {}),
    });

    return {
        slug,
        realm:               slug,
        keycloakClientId:    cmsClientId,
        keycloakRoleName:    adminRoleName,
        assetsBucketId,
        ...(wantsDelivery ? { deliveryBucketId } : {}),
        welcomeEmailSentTo:  input.adminUser.email,
    };
}

function mergeBucketDefaults(globalOverrides?: Partial<BucketDefaults>, perTenantOverrides?: Partial<BucketDefaults>): BucketDefaults {
    return { ...DEFAULT_BUCKET_DEFAULTS, ...(globalOverrides ?? {}), ...(perTenantOverrides ?? {}) };
}

function generateSessionSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
