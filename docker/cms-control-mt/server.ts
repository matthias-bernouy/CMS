// Multi-tenant CMS Control bootstrap. One container, many tenants.
// External MongoDB + per-tenant Keycloak/CDN. Tenants are provisioned by the
// hub (the `cms-control` tenant-provisioner), not by an in-process superadmin.
// This process boot-mounts the tenants already in the registry; the
// provisioning connector (onProvision → addTenant) is wired separately.

import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import { EnvelopeSecretCrypto, OvhOkmsKekProvider } from "@bernouy/core";
import { MongoDekRepository, type CmsDekDocument } from "@bernouy/cms";
import { MtControlCms, MongoTenantRepository } from "@bernouy/mt-cms-control";

const required = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
};

const MAIN_DOMAIN                       = required("MAIN_DOMAIN");
const MONGO_URL                         = required("MONGO_URL");
const MONGO_DB_NAME                     = process.env.MONGO_DB_NAME ?? "mt-cms";

// OVH OKMS Customer Managed Key for the platform's per-tenant secrets
// envelope encryption. The KEK never leaves OVH's HSM — the process
// only round-trips wrapped DEKs over mTLS using the same access cert
// pair as the OKMS bundle pull (cf. `okms-fetch.sh`).
const OKMS_REGION    = required("OKMS_REGION");
const OKMS_DOMAIN_ID = required("OKMS_DOMAIN_ID");
const OKMS_CERT_PATH = process.env.OKMS_CERT_PATH ?? "/etc/okms/client.crt";
const OKMS_KEY_PATH  = process.env.OKMS_KEY_PATH  ?? "/etc/okms/client.key";
const CMS_KEK_KEY_ID = required("CMS_KEK_KEY_ID"); // OVH service-key UUID

// Shared, platform-level admin OIDC — one realm + client for every tenant,
// configured once here (not per-tenant). The shared client uses a wildcard
// redirect URI; each tenant keeps its own cookie name + auth basePath.
const adminOidc = {
    issuer:        required("CMS_ADMIN_OIDC_ISSUER"),
    clientId:      required("CMS_ADMIN_OIDC_CLIENT_ID"),
    clientSecret:  required("CMS_ADMIN_OIDC_CLIENT_SECRET"),
    sessionSecret: required("CMS_ADMIN_OIDC_SESSION_SECRET"),
    ...(process.env.CMS_ADMIN_OIDC_CLI_CLIENT_ID ? { cliClientId: process.env.CMS_ADMIN_OIDC_CLI_CLIENT_ID } : {}),
};

const PORT = Number(process.env.PORT ?? 3000);
const APP_BASE_URL = `https://${MAIN_DOMAIN}`;

const mongo = new MongoClient(MONGO_URL);
await mongo.connect();
const db = mongo.db(MONGO_DB_NAME);

const runner = new BunRunner();

// Single platform-wide envelope-encryption surface. One DEK per tenant,
// keyed by `scopeId = tenant.id` in the shared `cms_deks` collection.
// All DEKs are wrapped by the OVH CMK above.
const kekProvider  = new OvhOkmsKekProvider({
    region:   OKMS_REGION,
    domainId: OKMS_DOMAIN_ID,
    keyId:    CMS_KEK_KEY_ID,
    certPath: OKMS_CERT_PATH,
    keyPath:  OKMS_KEY_PATH,
});
const dekRepo      = new MongoDekRepository(db.collection<CmsDekDocument>("cms_deks"));
const secretCrypto = new EnvelopeSecretCrypto(kekProvider, dekRepo);

const mt = new MtControlCms({
    runner,
    db,
    appBaseUrl: APP_BASE_URL,
    tenantRepo: new MongoTenantRepository(db),
    secretCrypto,
    adminOidc,
});

await mt.init();

// Liveness probe — the container has no root surface anymore (no superadmin).
runner.get("/health", () => new Response("ok"));

runner.start(PORT);
console.log(`✅ mt-cms-control listening on :${PORT} (${APP_BASE_URL})`);
console.log(`   mounted tenants: ${mt.listMounted().length}`);
