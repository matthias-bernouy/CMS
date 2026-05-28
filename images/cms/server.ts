// Basic CMS image — single Bun process serving:
//   - ControlCms  on /cms      (admin UI + REST + visual editor)
//   - DeliveryCms on /         (public-facing rendered pages)
//
// Everything in-memory: data, files, secrets, users, OIDC providers, PATs,
// rate limits. Nothing persists across restarts — this image is the
// "5-minute demo" entrypoint, not a production deployment.
//
// The bootstrap admin is seeded on every boot from `CMS_ADMIN_EMAIL` /
// `CMS_ADMIN_PASSWORD` (the latter is generated + logged when absent, gated
// `NODE_ENV !== "production"` so a mis-wired prod image cannot leak it).
//
// nginx sits in front as a sidecar (see compose.yml) — it only does
// reverse-proxy. TLS termination is the operator's concern (Cloudflare,
// nginx-proxy-manager, or a follow-up image with certbot).

import { BunRunner } from "@bernouy/runner-bun";
import { SignedCookieCodec, randomBase64Url } from "@bernouy/core";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import {
    InMemoryCmsRepository,
    InMemoryCmsFilesMetadata,
    InMemoryCmsFilesBlob,
    InMemoryCache,
    InMemorySecretStore,
    type CMS_ROLES,
} from "@bernouy/cms-shared";
import {
    InMemoryUsersRepository,
    InMemoryIdentityProviderRepository,
    InMemoryLocalCredentialStore,
    InMemoryPatRepository,
    InMemoryRateLimiter,
    SubjectResolver,
    LocalAuthentication,
    OidcAuthentication,
    internalUserId,
} from "@bernouy/auth-core";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing`);
};

const PORT               = Number(process.env.PORT ?? 3000);
const CMS_PUBLIC_URL     = env("CMS_PUBLIC_URL", `http://localhost:${PORT}`);
const CMS_SESSION_SECRET = env("CMS_SESSION_SECRET");
const CMS_ADMIN_EMAIL    = env("CMS_ADMIN_EMAIL", "admin@local.com");
const CMS_ADMIN_PASSWORD = process.env.CMS_ADMIN_PASSWORD;

// Shared state — one in-memory repo for content, one for files, one for
// secrets, one per auth surface. Lost on restart by design.
const repo              = new InMemoryCmsRepository();
const cache             = new InMemoryCache();
const secrets           = new InMemorySecretStore();
const filesMetadata     = new InMemoryCmsFilesMetadata();
const filesBlob         = new InMemoryCmsFilesBlob();
const users             = new InMemoryUsersRepository<CMS_ROLES>();
const identityProviders = new InMemoryIdentityProviderRepository();
const credentials       = new InMemoryLocalCredentialStore();
const pats              = new InMemoryPatRepository();
const rateLimit         = new InMemoryRateLimiter({ limit: 8, windowSeconds: 300 });

// Seed the builtin `local` identity provider + bootstrap admin (idempotent —
// no-ops on the second pass since everything is in memory and lost on restart
// anyway, but keeps the shape consistent with the persisted variants).
if (!(await identityProviders.get("local"))) {
    await identityProviders.create({
        id: "local", kind: "local", enabled: true,
        displayName: "Email & password",
    });
}
const adminPassword = CMS_ADMIN_PASSWORD ?? randomBase64Url(18);
const adminIdentity = await credentials.create({
    email:       CMS_ADMIN_EMAIL,
    password:    adminPassword,
    displayName: "Administrator",
});
await users.upsert(
    { ...adminIdentity, sub: internalUserId("local", adminIdentity.sub), provider: "local" },
    "admin",
);
if (!CMS_ADMIN_PASSWORD && process.env.NODE_ENV !== "production") {
    console.warn(`[cms] bootstrap admin: ${CMS_ADMIN_EMAIL} / ${adminPassword} (generated)`);
}

const runner       = new BunRunner();
const codec        = new SignedCookieCodec(new TextEncoder().encode(CMS_SESSION_SECRET));
const resolver     = new SubjectResolver<CMS_ROLES>(users, "user");
const cookieSecure = CMS_PUBLIC_URL.startsWith("https");

// Control admin under /cms — auth chain captures sub, mounts /cms/auth/* +
// /cms/login + /cms/admin/* + /cms/api/* + /cms/assets/* + /cms/resources/*.
runner.group("/cms", (sub) => {
    const auth = new LocalAuthentication<CMS_ROLES>(sub, {
        providerId:    "local",
        basePath:      "/auth",
        loginPagePath: "/cms/login",
        logoutPath:    "/cms/auth/logout",
        credentials, resolver, codec, pats,
        rateLimit,
        cookieName:    "cms-session",
        cookieSecure,
        defaultHome:   "/cms/admin/pages",
    });
    new OidcAuthentication<CMS_ROLES>(sub, {
        basePath:      "/auth",
        callbackBase:  `${CMS_PUBLIC_URL}/cms/auth`,
        providers:     identityProviders,
        secrets,
        resolver, codec, cookieName: "cms-session", cookieSecure,
        defaultHome:   "/cms/admin/pages",
        loginPagePath: "/cms/login",
    });
    new ControlCms(sub, repo, auth, {}, cache, secrets, filesMetadata, filesBlob, users, identityProviders, pats);
});

// Delivery at root — `setDefaultEndpoint` on the runner so any request that
// doesn't match an explicit /cms/* handler falls through to page rendering.
new DeliveryCms({ runner, repository: repo, cache });

runner.start(PORT);
console.log(`🚀 CMS listening on :${PORT}`);
console.log(`   public site:  ${CMS_PUBLIC_URL}/`);
console.log(`   admin:        ${CMS_PUBLIC_URL}/cms/admin/`);
console.log(`   sign in:      ${CMS_PUBLIC_URL}/cms/login`);
console.log(`   storage:      in-memory (lost on restart)`);
