// CMS tenant-provisioner — dev image. One process, **two runners** (two ports):
//   - providerRunner (:PORT) — the conforming tenant-provisioner
//     (`createCmsProvider`) + issuer-kit metadoc/JWKS. The SDK installs a
//     GLOBAL auth guard (`runner.use`, server-to-server Bearer), so this
//     runner is hub-only.
//   - adminRunner (:ADMIN_PORT) — the browser-facing multi-tenant admin
//     runtime (`MtControlCms`), mounting each tenant's CMS Control under
//     `/cms/<id>/*` behind its own Keycloak cookie auth. It MUST be a separate
//     runner: the SDK guard would otherwise 401 every browser request.
//
// The provider's lifecycle hooks drive the runtime: `onProvision` →
// `provisionTenant`, `onUpdate` → `reprovisionTenant`, `onDeprovision` →
// `deprovisionTenant`. Per-tenant CMS data lives in Mongo, isolated by
// collection prefix (`tenant_<id>__*`). Logs + secret KEK are dev-grade
// (in-memory / in-process); prod wires a persistent store + OKMS.

import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import { EnvelopeSecretCrypto, LocalKekProvider } from "@bernouy/core";
import { MongoDekRepository, type CmsDekDocument } from "@bernouy/cms";
import { MemoryKeyStore, createTenantIssuer } from "@bernouy/issuer-kit";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { createCmsProvider, type CmsTenantRuntime } from "@bernouy/tenant-provisioner-cms-control";
import { MtControlCms, MongoTenantRepository } from "@bernouy/mt-cms-control";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing`);
};

const PORT             = Number(process.env.PORT ?? 3000);        // provider (hub-facing)
const ADMIN_PORT       = Number(process.env.ADMIN_PORT ?? 4012);  // admin (browser-facing)
const TP_PUBLIC_URL    = env("TP_PUBLIC_URL");      // URL the hub fetches this TP at
const ADMIN_PUBLIC_URL = env("ADMIN_PUBLIC_URL");   // browser base for the admin; Keycloak callbacks = {ADMIN_PUBLIC_URL}/cms/<id>/auth/*
const HUB_ISSUER_URL   = env("HUB_ISSUER_URL");     // the hub iss (allowlisted)
const MONGO_URL        = env("MONGO_URL");
const MONGO_DB_NAME    = env("MONGO_DB_NAME", "cms_dev");

// Shared, platform-level admin OIDC — one realm + client for every tenant,
// configured once here (not per-tenant). The shared client uses a wildcard
// redirect URI; each tenant keeps its own cookie name + auth basePath.
const adminOidc = {
    issuer:        env("CMS_ADMIN_OIDC_ISSUER"),
    clientId:      env("CMS_ADMIN_OIDC_CLIENT_ID"),
    clientSecret:  env("CMS_ADMIN_OIDC_CLIENT_SECRET"),
    sessionSecret: env("CMS_ADMIN_OIDC_SESSION_SECRET"),
    ...(process.env.CMS_ADMIN_OIDC_CLI_CLIENT_ID ? { cliClientId: process.env.CMS_ADMIN_OIDC_CLI_CLIENT_ID } : {}),
};

const mongo = new MongoClient(MONGO_URL);
await mongo.connect();
const db = mongo.db(MONGO_DB_NAME);

// Dev secret crypto: in-process KEK (NOT for production — prod wires OKMS).
// Stable across restarts so wrapped DEKs keep decrypting: from env, else a
// deterministic dev key derived from a fixed seed.
const kekB64 = process.env.CMS_LOCAL_KEK_B64;
const kek    = kekB64 ? Buffer.from(kekB64, "base64") : createHash("sha256").update("cms-tp-dev-kek").digest();
const secretCrypto = new EnvelopeSecretCrypto(
    new LocalKekProvider(kek),
    new MongoDekRepository(db.collection<CmsDekDocument>("cms_deks")),
);

// Two runners — see the file header. The SDK guards its whole runner, so the
// browser admin lives on its own.
const providerRunner = new BunRunner();
const adminRunner    = new BunRunner();

// Browser-facing admin runtime on its own runner. `init()` (below) re-mounts
// tenants already in the registry — the hub does not re-run onProvision after
// a restart.
const mt = new MtControlCms({
    runner:     adminRunner,
    db,
    appBaseUrl: ADMIN_PUBLIC_URL,
    tenantRepo: new MongoTenantRepository(db),
    secretCrypto,
    adminOidc,
});

// Adapter: translate the provider lifecycle into runtime mounts. Admin OIDC is
// platform-level (configured once on `mt`), so only the tenant id/name + the
// bootstrap admin email flow here.
const runtime: CmsTenantRuntime = {
    provision:   ({ tenantId, displayName, initialAdminEmail }) =>
        mt.provisionTenant({ id: tenantId, name: displayName ?? tenantId, initialAdminEmail }),
    reprovision: ({ tenantId, displayName, initialAdminEmail }) =>
        mt.reprovisionTenant({ id: tenantId, name: displayName ?? tenantId, initialAdminEmail }),
    deprovision: ({ tenantId, force }) =>
        mt.deprovisionTenant(tenantId, { force }),
};

const provider = createCmsProvider({
    db,
    hubIssuer: HUB_ISSUER_URL,
    runtime,
    logStore:  new MemoryLogStore(),
});

// Publish the TP's RFC 8414 metadoc + JWKS so the hub's import flow
// (discoverEndpoints) can pick up issuer + jwks_uri.
const tenantIssuer = createTenantIssuer({
    issuer: TP_PUBLIC_URL,
    keyStore: new MemoryKeyStore({
        now: () => Math.floor(Date.now() / 1000),
        keyOverlapSeconds: 300,
    }),
});
tenantIssuer.mount(providerRunner);
await provider.mount(providerRunner);

await mt.init();   // boot-mount the tenants already in the registry (adminRunner)

providerRunner.start(PORT);
adminRunner.start(ADMIN_PORT);

console.log(`🚀 cms-tp`);
console.log(`   provider :${PORT}      iss ${TP_PUBLIC_URL}  trusts ${HUB_ISSUER_URL} (control-plane)`);
console.log(`   admin    :${ADMIN_PORT}  base ${ADMIN_PUBLIC_URL}  (${mt.listMounted().length} tenant(s) mounted)`);
console.log(`   mongo    ${MONGO_DB_NAME}`);
