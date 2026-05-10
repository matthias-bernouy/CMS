// Multi-tenant CMS Control bootstrap. One container, many tenants.
// External MongoDB + per-tenant Keycloak/CDN (declared via the superadmin UI).

import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import { EnvelopeSecretCrypto, OvhOkmsKekProvider, type Subject } from "@bernouy/core";
import { KeycloakConsumer, KeycloakBearerConsumer } from "@bernouy/auth-keycloak";
import { CompositeAuthentication } from "@bernouy/auth-composite";
import { MongoDekRepository, type CmsDekDocument } from "@bernouy/cms";
import { MtControlCms, MongoTenantRepository, type SuperadminRole } from "@bernouy/mt-cms-control";

const required = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
};

const MAIN_DOMAIN                       = required("MAIN_DOMAIN");
const MONGO_URL                         = required("MONGO_URL");
const MONGO_DB_NAME                     = process.env.MONGO_DB_NAME ?? "mt-cms";

const SUPERADMIN_KEYCLOAK_ISSUER         = required("SUPERADMIN_KEYCLOAK_ISSUER");
const SUPERADMIN_KEYCLOAK_CLIENT_ID      = required("SUPERADMIN_KEYCLOAK_CLIENT_ID");
const SUPERADMIN_KEYCLOAK_CLIENT_SECRET  = required("SUPERADMIN_KEYCLOAK_CLIENT_SECRET");
const SUPERADMIN_KEYCLOAK_SESSION_SECRET = required("SUPERADMIN_KEYCLOAK_SESSION_SECRET");
const SUPERADMIN_KEYCLOAK_ADMIN_ROLE     = process.env.SUPERADMIN_KEYCLOAK_ADMIN_ROLE ?? "cms-superadmin";

// OVH OKMS Customer Managed Key for the platform's per-tenant secrets
// envelope encryption. The KEK never leaves OVH's HSM — the process
// only round-trips wrapped DEKs over mTLS using the same access cert
// pair as the OKMS bundle pull (cf. `okms-fetch.sh`).
const OKMS_REGION    = required("OKMS_REGION");
const OKMS_DOMAIN_ID = required("OKMS_DOMAIN_ID");
const OKMS_CERT_PATH = process.env.OKMS_CERT_PATH ?? "/etc/okms/client.crt";
const OKMS_KEY_PATH  = process.env.OKMS_KEY_PATH  ?? "/etc/okms/client.key";
const CMS_KEK_KEY_ID = required("CMS_KEK_KEY_ID"); // OVH service-key UUID

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

const claimsToSuperadminSubject = (claims: Record<string, unknown>): Subject<SuperadminRole> => {
    const realmRoles = ((claims as { realm_access?: { roles?: string[] } }).realm_access?.roles) ?? [];
    const role: SuperadminRole = realmRoles.includes(SUPERADMIN_KEYCLOAK_ADMIN_ROLE) ? "superadmin" : "user";
    return {
        identifier:  String(claims.sub ?? ""),
        displayName: String(claims.preferred_username ?? claims.email ?? "user"),
        role,
    };
};

const superadminCookie = new KeycloakConsumer<SuperadminRole>(runner, {
    issuer:        SUPERADMIN_KEYCLOAK_ISSUER,
    clientId:      SUPERADMIN_KEYCLOAK_CLIENT_ID,
    clientSecret:  SUPERADMIN_KEYCLOAK_CLIENT_SECRET,
    appBaseUrl:    APP_BASE_URL,
    sessionSecret: SUPERADMIN_KEYCLOAK_SESSION_SECRET,
    cookieName:    "cms-superadmin-session",
    basePath:      "/superadmin/auth",
    claimsToSubject: claimsToSuperadminSubject,
});

const superadminBearer = new KeycloakBearerConsumer<SuperadminRole>({
    issuer:          SUPERADMIN_KEYCLOAK_ISSUER,
    claimsToSubject: claimsToSuperadminSubject,
});

const superadminAuth = new CompositeAuthentication<SuperadminRole>(runner, {
    children: [
        { auth: superadminBearer },
        { auth: superadminCookie, displayName: "Keycloak" },
    ],
    basePath: "/superadmin/auth",
});

const mt = new MtControlCms({
    runner,
    db,
    appBaseUrl: APP_BASE_URL,
    tenantRepo: new MongoTenantRepository(db),
    superadminAuth,
    secretCrypto,
});

await mt.init();

runner.start(PORT);
console.log(`✅ mt-cms-control listening on :${PORT} (${APP_BASE_URL})`);
console.log(`   superadmin → /superadmin/  (auth: ${SUPERADMIN_KEYCLOAK_ISSUER})`);
console.log(`   mounted tenants: ${mt.listMounted().length}`);
