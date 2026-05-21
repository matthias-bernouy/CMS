// Hub — single Bun process serving /admin/* (UI), /api/* (REST), and the
// hub-issuer publication endpoints. POST-PIVOT: the hub no longer creates
// Keycloak realms / users / OIDC clients. It just :
//   - mints CP tokens to talk to data-providers
//   - keeps a registry of imported DPs
//   - keeps a registry of namespaces + their per-DP provisions
//
// All env vars come from the OKMS bundle through `okms-fetch`; in dev,
// `entrypoint.sh` short-circuits OKMS and the vars come from compose.

// Defense-in-depth — every file the FileKeyStore writes inherits owner-only
// perms by default. Must be set BEFORE any Bun.write call.
process.umask(0o077);

import { MongoClient } from "mongodb";
import type { Subject, KekProvider } from "@bernouy/core";
import { OvhOkmsKekProvider, LocalKekProvider, loadKek } from "@bernouy/core";
import { BunRunner } from "@bernouy/runner-bun";
import { KeycloakConsumer, KeycloakBearerConsumer } from "@bernouy/auth-keycloak";
import { CompositeAuthentication } from "@bernouy/auth-composite";
import { FileKeyStore } from "@bernouy/issuer-kit";
import {
    Hub, mountHubApi,
    MongoDataProviderImportsRepository, MongoNamespaceRepository,
} from "@bernouy/hub-api";
import { mountHubUi } from "@bernouy/hub-ui";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing (entrypoint.sh should have validated it)`);
};

const PORT           = Number(process.env.PORT ?? 3000);
const MAIN_DOMAIN    = env("MAIN_DOMAIN");
const HUB_PUBLIC_URL = env("HUB_PUBLIC_URL", `https://${MAIN_DOMAIN}`);

// Keycloak is needed ONLY to authenticate superadmins on /admin/* — never
// for managing tenants. We accept tokens from a realm of the operator's
// choice (master in dev). Drop the entire admin-client / SMTP config.
const KEYCLOAK_BASE_URL       = env("KEYCLOAK_BASE_URL");
const KEYCLOAK_API_AUTH_REALM = env("KEYCLOAK_API_AUTH_REALM", "master");
const KEYCLOAK_API_AUTH_ROLE  = env("KEYCLOAK_API_AUTH_ROLE",  "superadmin");

const HUB_KEY_STORE_PATH = env("HUB_KEY_STORE_PATH");

// KEK provider — wraps the hub-issuer signing keys.
const HUB_LOCAL_KEK_B64 = process.env.HUB_LOCAL_KEK_B64;
const kekProvider: KekProvider = HUB_LOCAL_KEK_B64
    ? new LocalKekProvider(loadKek(HUB_LOCAL_KEK_B64, "HUB_LOCAL_KEK_B64"))
    : new OvhOkmsKekProvider({
        region:   env("OKMS_REGION"),
        domainId: env("OKMS_DOMAIN_ID"),
        keyId:    env("HUB_KEK_KEY_ID"),
        certPath: env("OKMS_CERT_PATH", "/run/hub/okms/client.crt"),
        keyPath:  env("OKMS_KEY_PATH",  "/run/hub/okms/client.key"),
    });

const now = () => Math.floor(Date.now() / 1000);
const keyStore = new FileKeyStore({
    path:              HUB_KEY_STORE_PATH,
    kek:               kekProvider,
    now,
    keyOverlapSeconds: 300,
});

// Mongo — both DP imports + namespace registry. Optional; without
// `MONGO_URL` the hub falls back to in-memory repos (lost on restart).
let imports:    MongoDataProviderImportsRepository | undefined;
let namespaces: MongoNamespaceRepository           | undefined;
const MONGO_URL = process.env.MONGO_URL;
if (MONGO_URL) {
    const mongo = new MongoClient(MONGO_URL);
    await mongo.connect();
    const db = mongo.db(env("MONGO_DB_NAME", "hub_meta"));
    imports    = new MongoDataProviderImportsRepository(db);
    namespaces = new MongoNamespaceRepository(db);
    await imports.initIndexes();
    await namespaces.initIndexes();
}

type Role = "superadmin" | "user";

const hub = new Hub({
    issuer: { baseUrl: HUB_PUBLIC_URL, keyStore },
    ...(imports    ? { imports }    : {}),
    ...(namespaces ? { namespaces } : {}),
});

const runner = new BunRunner();

const claimsToSubject = (claims: Record<string, unknown>): Subject<Role> => {
    const roles = ((claims as { realm_access?: { roles?: string[] } }).realm_access?.roles) ?? [];
    const role: Role = roles.includes(KEYCLOAK_API_AUTH_ROLE) ? "superadmin" : "user";
    return {
        identifier:  String(claims.sub ?? ""),
        displayName: String(claims.preferred_username ?? claims.email ?? "service-account"),
        role,
    };
};

const bearerAuth = new KeycloakBearerConsumer<Role>({
    issuer: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_API_AUTH_REALM}`,
    claimsToSubject,
});

// Session cookie for the /admin browser users. Redirect URIs derive from
// HUB_PUBLIC_URL + basePath.
const cookieAuth = new KeycloakConsumer<Role>(runner, {
    issuer:        `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_API_AUTH_REALM}`,
    clientId:      env("HUB_KEYCLOAK_CLIENT_ID"),
    clientSecret:  env("HUB_KEYCLOAK_CLIENT_SECRET"),
    appBaseUrl:    HUB_PUBLIC_URL,
    basePath:      "/admin/auth",
    sessionSecret: env("HUB_SESSION_SECRET"),
    claimsToSubject,
});

const auth = new CompositeAuthentication<Role>(runner, {
    children: [
        { auth: bearerAuth },
        { auth: cookieAuth, displayName: "Keycloak" },
    ],
});

mountHubApi({ runner, hub, auth, requiredRole: "superadmin" });
await mountHubUi({ runner,     auth, requiredRole: "superadmin" });

runner.start(PORT);
console.log(`🚀 hub listening on :${PORT}`);
console.log(`   admin UI:     ${HUB_PUBLIC_URL}/admin/`);
console.log(`   API:          ${HUB_PUBLIC_URL}/api/`);
console.log(`   issuer (DP):  ${HUB_PUBLIC_URL}/.well-known/oauth-authorization-server`);
console.log(`   storage:      ${imports ? "Mongo (persisted)" : "Memory (lost on restart!)"}`);
