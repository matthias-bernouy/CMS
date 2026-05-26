import { join } from "node:path";
import type { Db } from "mongodb";
import type { Runner, SecretCrypto, Subject } from "@bernouy/core";
import { KeycloakConsumer, KeycloakBearerConsumer } from "@bernouy/auth-keycloak";
import { CompositeAuthentication } from "@bernouy/auth-composite";
import { Cms as ControlCms, MongoCmsRepository, EncryptedMongoSecretStore, MongoCmsFilesMetadata, LocalFsCmsFilesBlob, S3CmsFilesBlob, type CmsFilesBlobStore, type EncryptedSecretDocument } from "@bernouy/cms";
import type { Tenant } from "src/interfaces/Tenant";
import type { AdminOidcConfig } from "src/exports/MtControlCms";
import { loadAdminEmails } from "src/core/tenant/members";

export type TenantRole = "admin" | "user";

/** Live mount handle stored by `MtControlCms` so a later `unmountTenant`
 *  can drop the right routes + close any per-tenant resources. */
export type MountedTenant = {
    id:          string;
    pathPrefix:  string;
    /** Public origin (https://platform.com) used to build callback URLs. */
    appBaseUrl:  string;
};

export type MountTenantArgs = {
    runner:       Runner;
    db:           Db;
    tenant:       Tenant;
    appBaseUrl:   string;
    secretCrypto: SecretCrypto;
    /** Shared, platform-level admin OIDC (one realm + client for all tenants). */
    oidc:         AdminOidcConfig;
};

/**
 * Wires a full per-tenant CMS Control surface onto the shared runner:
 * - Keycloak cookie + bearer auth (authN only) against the shared realm
 * - **Authorization in the CMS**: admin iff the token's verified email is in
 *   the tenant's member set (loaded here, checked synchronously in
 *   `claimsToSubject`). No per-tenant Keycloak role.
 * - ControlCms with a Mongo repo prefixed by `tenant_<id>__`
 * - Files: a Mongo metadata tree + local-FS bytes, one root per tenant
 *
 * All routes land under `/cms/<id>/`. Subsequent calls to `unmountTenant`
 * remove this whole subtree without restarting the bun process.
 */
export async function mountTenant(args: MountTenantArgs): Promise<MountedTenant> {
    const { runner, db, tenant, appBaseUrl, secretCrypto, oidc } = args;
    const pathPrefix = `/cms/${tenant.id}`;

    // Admin membership, captured for this mount. The email comes from the
    // token at login, so the (sync) `claimsToSubject` can gate on it.
    const adminEmails = await loadAdminEmails(db, tenant.id);

    const cookieAuth = new KeycloakConsumer<TenantRole>(runner, {
        issuer:        oidc.issuer,
        clientId:      oidc.clientId,
        clientSecret:  oidc.clientSecret,
        appBaseUrl,
        sessionSecret: oidc.sessionSecret,
        cookieName:    `cms-${tenant.id}-session`,
        basePath:      `${pathPrefix}/auth`,
        claimsToSubject: (claims) => mapClaimsToSubject(claims, adminEmails),
    });

    const bearerAuth = new KeycloakBearerConsumer<TenantRole>({
        issuer:          oidc.issuer,
        claimsToSubject: (claims) => mapClaimsToSubject(claims, adminEmails),
    });

    const auth = new CompositeAuthentication<TenantRole>(runner, {
        children: [
            { auth: bearerAuth },
            { auth: cookieAuth, displayName: "Keycloak" },
        ],
        basePath: `${pathPrefix}/auth`,
    });

    const repo = new MongoCmsRepository(db, { collectionPrefix: `tenant_${tenant.id}__` });
    await repo.init();

    // Files: Mongo metadata tree + a per-tenant blob backend. Production uses
    // S3-compatible object storage when `CMS_S3_BUCKET` is set (tenant isolated
    // by key prefix); otherwise a local-FS dir (dev / single-node interim).
    const filesMetadata = new MongoCmsFilesMetadata(db, { collectionPrefix: `tenant_${tenant.id}__` });
    await filesMetadata.init();
    const filesBlob: CmsFilesBlobStore = process.env.CMS_S3_BUCKET
        ? new S3CmsFilesBlob({
            bucket:          process.env.CMS_S3_BUCKET,
            accessKeyId:     process.env.CMS_S3_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.CMS_S3_SECRET_ACCESS_KEY ?? "",
            ...(process.env.CMS_S3_REGION   ? { region:   process.env.CMS_S3_REGION }   : {}),
            ...(process.env.CMS_S3_ENDPOINT ? { endpoint: process.env.CMS_S3_ENDPOINT } : {}),
            prefix: `tenant_${tenant.id}/`,
        })
        : new LocalFsCmsFilesBlob(join(process.env.CMS_FILES_DIR ?? "./cms-files", tenant.id));

    // Per-tenant secret store: docs persist in `tenant_<id>__secrets`,
    // encrypted via `EnvelopeSecretCrypto` with `scopeId = tenant.id`.
    // Cross-tenant decryption is impossible — distinct scopeIds resolve
    // to distinct DEKs (one per tenant in the shared `cms_deks`
    // collection wrapped by the platform KEK).
    const secretsCollection = db.collection<EncryptedSecretDocument>(`tenant_${tenant.id}__secrets`);
    const secrets = new EncryptedMongoSecretStore({
        scopeId:      tenant.id,
        collection:   secretsCollection,
        secretCrypto,
    });

    runner.group(pathPrefix, (sub) => {
        sub.get("/api/auth/discovery", () => Response.json({
            issuer:   oidc.issuer,
            clientId: oidc.cliClientId ?? `${oidc.clientId}-cli`,
            grant:    "urn:ietf:params:oauth:grant-type:device_code",
        }));
        new ControlCms(sub, repo, auth, {
            tokensUrl: `${oidc.issuer}/account/`,
        }, undefined, secrets, filesMetadata, filesBlob);
    });

    return { id: tenant.id, pathPrefix, appBaseUrl };
}

function mapClaimsToSubject(
    claims: Record<string, unknown>,
    adminEmails: Set<string>,
): Subject<TenantRole> {
    // Identity is the opaque `sub` (contract: identifier is NOT the email).
    // Authorization is by verified email against the tenant's member set —
    // an unverified email never grants admin.
    const verified = claims.email_verified === true;
    const email = verified ? String(claims.email ?? "").trim().toLowerCase() : "";
    const role: TenantRole = email && adminEmails.has(email) ? "admin" : "user";
    return {
        identifier:  String(claims.sub ?? ""),
        displayName: String(claims.preferred_username ?? claims.email ?? "user"),
        role,
    };
}
