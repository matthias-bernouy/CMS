// CMS Control bootstrap. External MongoDB; CDN consumer via broker → frontière C.

import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import type { Middleware, Subject } from "@bernouy/core";
import { KeycloakConsumer } from "@bernouy/auth-keycloak";
import { Cms as ControlCms, MongoCmsRepository } from "@bernouy/cms";
import { StorageTokenBroker, StorageBrowser } from "@bernouy/cdn";

const required = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
};

const MAIN_DOMAIN              = required("MAIN_DOMAIN");
const MONGO_URL                = required("MONGO_URL");
const MONGO_DB_NAME            = process.env.MONGO_DB_NAME ?? "cms";

const KEYCLOAK_ISSUER          = required("KEYCLOAK_ISSUER");
const KEYCLOAK_CLIENT_ID       = required("KEYCLOAK_CLIENT_ID");
const KEYCLOAK_CLIENT_SECRET   = required("KEYCLOAK_CLIENT_SECRET");
const KEYCLOAK_SESSION_SECRET  = required("KEYCLOAK_SESSION_SECRET");
const KEYCLOAK_ADMIN_ROLE      = process.env.KEYCLOAK_ADMIN_ROLE ?? "admin";
const KEYCLOAK_TOKENS_URL      = process.env.KEYCLOAK_TOKENS_URL
    ?? `${KEYCLOAK_ISSUER}/account/`;

const CDN_URL                  = required("CDN_URL");
const CDN_BUCKET_CREDENTIAL    = required("CDN_BUCKET_CREDENTIAL");

const PORT = Number(process.env.PORT ?? 3000);
const APP_BASE_URL = `https://${MAIN_DOMAIN}`;

const mongo = new MongoClient(MONGO_URL);
await mongo.connect();
const db = mongo.db(MONGO_DB_NAME);

const repo = new MongoCmsRepository(db);
await repo.init();

const runner = new BunRunner();

type CmsRole = "admin" | "user";

const auth = new KeycloakConsumer<CmsRole>(runner, {
    issuer:        KEYCLOAK_ISSUER,
    clientId:      KEYCLOAK_CLIENT_ID,
    clientSecret:  KEYCLOAK_CLIENT_SECRET,
    appBaseUrl:    APP_BASE_URL,
    sessionSecret: KEYCLOAK_SESSION_SECRET,
    claimsToSubject: (claims): Subject<CmsRole> => {
        const realmRoles = ((claims as { realm_access?: { roles?: string[] } }).realm_access?.roles) ?? [];
        const role: CmsRole = realmRoles.includes(KEYCLOAK_ADMIN_ROLE) ? "admin" : "user";
        return {
            identifier:  String(claims.sub ?? ""),
            displayName: String(claims.preferred_username ?? claims.email ?? "user"),
            role,
        };
    },
});

// Broker — mounted at /cms/_storage with an admin guard so only signed-in
// admins can mint upload tokens. The credential never leaves this process.
const adminGuard: Middleware = async (req, next) => {
    const subject = await auth.getSubject(req);
    if (!subject || subject.role !== "admin") {
        return new Response("forbidden", { status: 403 });
    }
    return next();
};

const broker = new StorageTokenBroker({
    runner,
    providerOrigin:  CDN_URL,
    credentialToken: CDN_BUCKET_CREDENTIAL,
    mountPath:       "/cms/_storage",
    middlewares:     [adminGuard],
});

// Seed the `StorageBrowser` instance with the bucket info. The instance is
// purely a value here — never .fetch()'d server-side; only its serialized
// form ships to the browser as `window._cms.CDN`.
const bucket = await broker.getBucketInfo();
const cdn = new StorageBrowser({
    apiBaseUrl: "/cms/_storage",
    bucket: {
        limits:       bucket.limits,
        quotas:       bucket.quotas,
        cacheControl: bucket.cacheControl,
    },
});

runner.group("/cms", (cmsRunner) => {
    new ControlCms(cmsRunner, repo, auth, cdn, { tokensUrl: KEYCLOAK_TOKENS_URL });
});

runner.start(PORT);
console.log(`✅ cms-control listening on :${PORT} (${APP_BASE_URL}, auth: ${KEYCLOAK_ISSUER})`);
