import { join } from "node:path";
import type { Db } from "mongodb";
import type { Runner, SecretCrypto, Subject } from "@bernouy/core";
import { KeycloakConsumer, KeycloakBearerConsumer } from "@bernouy/auth-keycloak";
import { CompositeAuthentication } from "@bernouy/auth-composite";
import { Cms as ControlCms, MongoCmsRepository, EncryptedMongoSecretStore, MongoCmsFilesMetadata, LocalFsCmsFilesBlob, type EncryptedSecretDocument } from "@bernouy/cms";
import type { Tenant } from "src/interfaces/Tenant";
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
    const { runner, db, tenant, appBaseUrl, secretCrypto } = args;
    const pathPrefix = `/cms/${tenant.id}`;

    // Admin membership, captured for this mount. The email comes from the
    // token at login, so the (sync) `claimsToSubject` can gate on it.
    const adminEmails = await loadAdminEmails(db, tenant.id);

    const cookieAuth = new KeycloakConsumer<TenantRole>(runner, {
        issuer:        tenant.keycloak.issuer,
        clientId:      tenant.keycloak.clientId,
        clientSecret:  tenant.keycloak.clientSecret,
        appBaseUrl,
        sessionSecret: tenant.keycloak.sessionSecret,
        cookieName:    `cms-${tenant.id}-session`,
        basePath:      `${pathPrefix}/auth`,
        claimsToSubject: (claims) => mapClaimsToSubject(claims, adminEmails),
    });

    const bearerAuth = new KeycloakBearerConsumer<TenantRole>({
        issuer:          tenant.keycloak.issuer,
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

    // Files: Mongo metadata tree + local-FS bytes, one root per tenant. Interim
    // backend — swap `LocalFsCmsFilesBlob` for an S3/CDN-provider blob later
    // (same `CmsFilesBlobStore` contract). `CMS_FILES_DIR` defaults to ./cms-files.
    const filesMetadata = new MongoCmsFilesMetadata(db, { collectionPrefix: `tenant_${tenant.id}__` });
    await filesMetadata.init();
    const filesBlob = new LocalFsCmsFilesBlob(join(process.env.CMS_FILES_DIR ?? "./cms-files", tenant.id));

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
            issuer:   tenant.keycloak.issuer,
            clientId: tenant.keycloak.cliClientId ?? `${tenant.keycloak.clientId}-cli`,
            grant:    "urn:ietf:params:oauth:grant-type:device_code",
        }));
        new ControlCms(sub, repo, auth, {
            tokensUrl: `${tenant.keycloak.issuer}/account/`,
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

function createTenantAdminGuard(auth: CompositeAuthentication<TenantRole>) {
    return async (req: Request, next: () => Promise<Response>): Promise<Response> => {
        const subject = await auth.getSubject(req);
        if (!subject || subject.role !== "admin") {
            return new Response("forbidden", { status: 403 });
        }
        return next();
    };
}

function safeOriginList(url: string): string[] {
    try { return [new URL(url).origin]; }
    catch { return []; }
}
