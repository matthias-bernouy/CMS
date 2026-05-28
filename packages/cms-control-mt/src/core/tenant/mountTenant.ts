import { join } from "node:path";
import type { Db } from "mongodb";
import type { Runner, SecretCrypto } from "@bernouy/core";
import { SignedCookieCodec } from "@bernouy/core";
import { Cms as ControlCms, MongoCmsRepository, EncryptedMongoSecretStore, MongoCmsFilesMetadata, LocalFsCmsFilesBlob, S3CmsFilesBlob, MongoUsersRepository, MongoIdentityProviderRepository, MongoLocalCredentialStore, MongoPatRepository, MongoRateLimiter, SubjectResolver, LocalAuthentication, OidcAuthentication, createPiiCrypto, type CmsFilesBlobStore, type EncryptedSecretDocument } from "@bernouy/cms";
import type { Tenant } from "src/interfaces/Tenant";
import type { AdminSessionConfig } from "src/exports/MtControlCms";

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
    /** Shared, platform-level session-signing config (one key for all tenants). */
    session:      AdminSessionConfig;
};

/**
 * Wires a full per-tenant CMS Control surface onto the shared runner:
 * - **CMS-owned auth**: `LocalAuthentication` (builtin email/password
 *   provider) + `OidcAuthentication` (one dynamic backend serving every
 *   redirect provider stored in the tenant's `identityProviders` repo,
 *   resolved per request — adding / editing / enabling one needs no remount).
 * - Signed session cookie issued by the CMS itself, named `cms-<id>-session`
 *   and signed with the platform-shared `session.sessionSecret`.
 * - Authorization from `UsersRepository` via `SubjectResolver` (`sub → role`,
 *   default `user`; bootstrap admin seeded by `seedTenantAuth`).
 * - ControlCms with Mongo repos + secret/files stores, all prefixed by
 *   `tenant_<id>__`, plus the auth repos + PAT repo wired in.
 *
 * All routes land under `/cms/<id>/`. Subsequent calls to `unmountTenant`
 * remove this whole subtree without restarting the bun process.
 */
export async function mountTenant(args: MountTenantArgs): Promise<MountedTenant> {
    const { runner, db, tenant, appBaseUrl, secretCrypto, session } = args;
    const pathPrefix = `/cms/${tenant.id}`;

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

    // Auth surfaces, tenant-isolated by the same `tenant_<id>__` prefix. PII
    // (user email/displayName, credential email) is encrypted at rest under the
    // tenant DEK via `PiiCrypto`; secrets stay in the encrypted secret store.
    const pii = await createPiiCrypto(tenant.id, secretCrypto, db, `tenant_${tenant.id}__`);
    const users = new MongoUsersRepository<TenantRole>(db, pii, { collectionPrefix: `tenant_${tenant.id}__` });
    const identityProviders = new MongoIdentityProviderRepository(db, { collectionPrefix: `tenant_${tenant.id}__` });
    const credentials = new MongoLocalCredentialStore(db, pii, { collectionPrefix: `tenant_${tenant.id}__` });
    await credentials.init();
    // Personal Access Tokens (CLI / server-to-server). Hashes only; one row per
    // token, isolated by the same tenant prefix.
    const pats = new MongoPatRepository(db, { collectionPrefix: `tenant_${tenant.id}__` });
    await pats.init();
    // Login brute-force throttle, keyed by email (shared state across nodes via
    // Mongo TTL). Checked before argon2; tuned for humans, not bots.
    const loginRateByEmail = new MongoRateLimiter(db, { limit: 8, windowSeconds: 300 }, { collectionPrefix: `tenant_${tenant.id}__` });
    await loginRateByEmail.init();

    // Authn → authz: a backend yields an Identity, the resolver records it under
    // its `provider:sub` key and assigns the role from the membership store
    // (per-identity — new identities default to `user`; the bootstrap local
    // admin is seeded `admin`). The CMS issues its own signed session cookie.
    const codec    = new SignedCookieCodec(new TextEncoder().encode(session.sessionSecret));
    const resolver = new SubjectResolver<TenantRole>(users, "user");

    const cookieName   = `cms-${tenant.id}-session`;
    const cookieSecure = appBaseUrl.startsWith("https");
    const defaultHome  = `${pathPrefix}/admin/pages`;
    const loginPage    = `${pathPrefix}/login`;

    runner.group(pathPrefix, (sub) => {
        const auth = new LocalAuthentication<TenantRole>(sub, {
            providerId:    "local",
            basePath:      "/auth",
            loginPagePath: loginPage,
            logoutPath:    `${pathPrefix}/auth/logout`,
            credentials, resolver, codec, pats,
            rateLimit: loginRateByEmail,
            cookieName, cookieSecure, defaultHome,
        });
        // One dynamic OIDC backend serves EVERY configured redirect provider,
        // resolved per request — adding/editing/enabling one needs no remount.
        new OidcAuthentication<TenantRole>(sub, {
            basePath:      "/auth",
            callbackBase:  `${appBaseUrl}${pathPrefix}/auth`,
            providers:     identityProviders,
            secrets,
            resolver, codec, cookieName, cookieSecure, defaultHome,
            loginPagePath: loginPage,
        });
        new ControlCms(sub, repo, auth, {},
            undefined, secrets, filesMetadata, filesBlob, users, identityProviders, pats);
    });

    return { id: tenant.id, pathPrefix, appBaseUrl };
}
