// Production CMS image — single Bun process serving Control and Delivery
// on two BunRunner instances behind an nginx + certbot sidecar (see
// compose.yml). Persistent storage in MongoDB (content, users, secrets,
// PATs, rate limits, file metadata) + local-filesystem blob storage for
// media bytes. Cache stays in-memory — single-instance only.
//
// All non-default envs are validated by docker-compose's ${VAR:?msg}
// before the container starts; this file assumes they're present.

import { BunRunner } from "@bernouy/runner-bun";
import {
    SignedCookieCodec,
    EnvelopeSecretCrypto,
    LocalKekProvider,
} from "@bernouy/core";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { MongoClient } from "mongodb";
import {
    MongoCmsRepository,
    MongoCmsFilesMetadata,
    LocalFsCmsFilesBlob,
    InMemoryCache,
    EncryptedMongoSecretStore,
    type CMS_ROLES,
} from "@bernouy/cms-shared";
import {
    MongoUsersRepository,
    MongoIdentityProviderRepository,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoRateLimiter,
    MongoDekRepository,
    SubjectResolver,
    LocalAuthentication,
    createPiiCrypto,
    internalUserId,
} from "@bernouy/auth-core";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing`);
};

const CONTROL_PORT        = Number(process.env.CONTROL_PORT  ?? 3000);
const DELIVERY_PORT       = Number(process.env.DELIVERY_PORT ?? 3001);
const CONTROL_PUBLIC_URL  = env("CONTROL_PUBLIC_URL");
const DELIVERY_PUBLIC_URL = env("DELIVERY_PUBLIC_URL");
const CMS_SESSION_SECRET  = env("CMS_SESSION_SECRET");
const CMS_KEK_HEX         = env("CMS_KEK_HEX");
const CMS_ADMIN_EMAIL     = env("CMS_ADMIN_EMAIL");
const CMS_ADMIN_PASSWORD  = env("CMS_ADMIN_PASSWORD");
const CMS_FILES_DIR       = env("CMS_FILES_DIR");
const MONGO_URL           = env("MONGO_URL");

// Single-tenant for now — the scope id flows into the DEK store + PII
// crypto + encrypted secret store. Changing it after data has been
// written makes existing rows unreadable.
const SCOPE_ID = "default";

const mongo = new MongoClient(MONGO_URL);
await mongo.connect();
// `db()` with no arg uses the default DB from MONGO_URL (the path segment,
// e.g. `/cms` in `mongodb://mongo:27017/cms`).
const db = mongo.db();

// KEK (env-provided 32-byte hex) wraps the per-scope DEK persisted in
// the `cms_deks` collection. Rotating CMS_KEK_HEX requires re-wrapping
// every DEK — don't change it casually.
const kekProvider  = new LocalKekProvider(Buffer.from(CMS_KEK_HEX, "hex"));
const dekRepo      = new MongoDekRepository(db.collection("cms_deks"));
const secretCrypto = new EnvelopeSecretCrypto(kekProvider, dekRepo);
const piiCrypto    = await createPiiCrypto(SCOPE_ID, secretCrypto, db);

const repo              = new MongoCmsRepository(db);                              await repo.init();
const filesMetadata     = new MongoCmsFilesMetadata(db);                           await filesMetadata.init();
const filesBlob         = new LocalFsCmsFilesBlob(CMS_FILES_DIR);
const users             = new MongoUsersRepository<CMS_ROLES>(db, piiCrypto);
const identityProviders = new MongoIdentityProviderRepository(db);
const credentials       = new MongoLocalCredentialStore(db, piiCrypto);            await credentials.init();
const pats              = new MongoPatRepository(db);                              await pats.init();
const rateLimit         = new MongoRateLimiter(db, { limit: 8, windowSeconds: 300 }); await rateLimit.init();
const secrets           = new EncryptedMongoSecretStore({
    scopeId:      SCOPE_ID,
    collection:   db.collection("cms_secrets"),
    secretCrypto,
});
const cache = new InMemoryCache();

// Seed the builtin `local` identity provider (idempotent).
if (!(await identityProviders.get("local"))) {
    await identityProviders.create({
        id: "local", kind: "local", enabled: true,
        displayName: "Email & password",
    });
}

// Bootstrap admin — one-shot. If the credential already exists, skip;
// CMS_ADMIN_PASSWORD only matters on first boot. To rotate, change it
// from the admin UI (or wipe the credentials collection).
const existingAdmin = await credentials.getByEmail(CMS_ADMIN_EMAIL);
if (!existingAdmin) {
    const identity = await credentials.create({
        email:       CMS_ADMIN_EMAIL,
        password:    CMS_ADMIN_PASSWORD,
        displayName: "Administrator",
    });
    await users.upsert(
        { ...identity, sub: internalUserId("local", identity.sub), provider: "local" },
        "admin",
    );
}

const codec        = new SignedCookieCodec(new TextEncoder().encode(CMS_SESSION_SECRET));
const resolver     = new SubjectResolver<CMS_ROLES>(users, "user");
const cookieSecure = CONTROL_PUBLIC_URL.startsWith("https");

// Control admin on its own runner/port — root-mounted (no `/cms` prefix;
// the port already isolates the admin surface from Delivery).
const controlRunner = new BunRunner();
const auth = new LocalAuthentication<CMS_ROLES>(controlRunner, {
    providerId:    "local",
    basePath:      "/auth",
    loginPagePath: "/login",
    logoutPath:    "/auth/logout",
    credentials, resolver, codec, pats,
    rateLimit,
    cookieName:    "cms-session",
    cookieSecure,
    defaultHome:   "/admin/pages",
});
new ControlCms(controlRunner, repo, auth, {}, cache, secrets, filesMetadata, filesBlob, users, identityProviders, pats, credentials);

// Delivery on its own runner/port — strictly public surface.
const deliveryRunner = new BunRunner();
new DeliveryCms({ runner: deliveryRunner, repository: repo, cache });

controlRunner.start(CONTROL_PORT);
deliveryRunner.start(DELIVERY_PORT);

console.log(`🚀 CMS listening`);
console.log(`   admin:        ${CONTROL_PUBLIC_URL}/admin/`);
console.log(`   sign in:      ${CONTROL_PUBLIC_URL}/login`);
console.log(`   public site:  ${DELIVERY_PUBLIC_URL}/`);
console.log(`   storage:      mongo=${db.databaseName}, files=${CMS_FILES_DIR}`);
