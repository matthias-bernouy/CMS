// Production CMS image — single Bun process serving Control and Delivery
// on two BunRunner instances behind an nginx + certbot sidecar (see
// compose.yml). Persistent storage in MongoDB (content, users, secrets,
// PATs, rate limits, file metadata) + local-filesystem blob storage for
// media bytes. Cache stays in-memory — single-instance only.
//
// All non-default envs are validated by docker-compose's ${VAR:?msg}
// before the container starts; this file assumes they're present.

import { BunRunner } from "@bernouy/http-runner";
import { EnvelopeSecretCrypto, LocalKekProvider } from "@bernouy/envelope-crypto";
import { MongoDekRepository, createFieldCrypto } from "@bernouy/envelope-crypto/mongo";
import { EncryptedMongoSecretStore } from "@bernouy/cms-secrets/mongo";
import { ValidatingSecretStore } from "@bernouy/cms-secrets";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { ValidatingGatewayRepository } from "@bernouy/cms-gateway";
import { MongoGatewayRepository } from "@bernouy/cms-gateway/mongo";
import { ValidatingAnalyticsStore } from "@bernouy/cms-analytics";
import { MongoAnalyticsStore } from "@bernouy/cms-analytics/mongo";
import { MongoClient } from "mongodb";
import { InMemoryCache } from "@bernouy/http-runner";
import { LocalFsCmsFilesBlob, ValidatingCmsFilesMetadata } from "@bernouy/cms-files";
import { MongoCmsFilesMetadata } from "@bernouy/cms-files/mongo";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { type CMS_ROLES, ValidatingRolesRepository } from "@bernouy/cms-permissions";
import { MongoRolesRepository } from "@bernouy/cms-permissions/mongo";
import {
    SignedCookieCodec,
    SubjectResolver,
    LocalAuthentication,
    AuthValidationError,
    createLocalUser,
} from "@bernouy/cms-auth";
import {
    MongoUsersRepository,
    MongoIdentityProviderRepository,
    MongoLocalCredentialStore,
    MongoPatRepository,
} from "@bernouy/cms-auth/mongo";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";

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
// Optional: shared secret salting the cookieless visitor id. Set it (and keep it
// identical) across instances for consistent unique-visitor counts; unset → an
// ephemeral per-boot salt (a mid-day restart recounts that day's visitors).
const ANALYTICS_SALT_SECRET = process.env.ANALYTICS_SALT_SECRET || crypto.randomUUID();

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
const fieldCrypto    = await createFieldCrypto(SCOPE_ID, secretCrypto, db);

const innerRepo         = new MongoCmsRepository(db);                              await innerRepo.init();
const repo              = new ValidatingCmsRepository(innerRepo);
const mongoFilesMeta    = new MongoCmsFilesMetadata(db);                           await mongoFilesMeta.init();
const filesMetadata     = new ValidatingCmsFilesMetadata(mongoFilesMeta);
const filesBlob         = new LocalFsCmsFilesBlob(CMS_FILES_DIR);
// Content-addressed store for the generated image variants (`<hash>-<w>.webp`).
// Lives next to the originals; safe to wipe — variants regenerate on demand.
const variantStore      = new LocalFsCmsFilesBlob(`${CMS_FILES_DIR}/.variants`);
const users             = new MongoUsersRepository<CMS_ROLES>(db, fieldCrypto);
const identityProviders = new MongoIdentityProviderRepository(db);
const credentials       = new MongoLocalCredentialStore(db, fieldCrypto);            await credentials.init();
const pats              = new MongoPatRepository(db);                              await pats.init();
const mongoGateway      = new MongoGatewayRepository(db);                          await mongoGateway.init();
const gateway           = new ValidatingGatewayRepository(mongoGateway);
const mongoAnalytics    = new MongoAnalyticsStore(db);                             await mongoAnalytics.init();
const analytics         = new ValidatingAnalyticsStore(mongoAnalytics);
const rateLimit         = new MongoRateLimiter(db, { limit: 8, windowSeconds: 300 }); await rateLimit.init();
const mongoRoles        = new MongoRolesRepository(db.collection("cms_roles"));    await mongoRoles.init();
const roles             = new ValidatingRolesRepository(mongoRoles);
const secrets           = new ValidatingSecretStore(new EncryptedMongoSecretStore({
    scopeId:      SCOPE_ID,
    collection:   db.collection("cms_secrets"),
    secretCrypto,
}));
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
    try {
        await createLocalUser({ credentials, users }, {
            email:       CMS_ADMIN_EMAIL,
            password:    CMS_ADMIN_PASSWORD,
            displayName: "Administrator",
            role:        "admin",
        });
    } catch (err) {
        if (err instanceof AuthValidationError) {
            throw new Error(`Invalid CMS_ADMIN_PASSWORD for first admin bootstrap: ${err.message}`);
        }
        throw err;
    }
}

const codec        = new SignedCookieCodec(new TextEncoder().encode(CMS_SESSION_SECRET));
const resolver     = new SubjectResolver<CMS_ROLES>(users, "user");
const cookieSecure = CONTROL_PUBLIC_URL.startsWith("https");

// Control admin on its own runner/port — root-mounted (no `/cms` prefix;
// the port already isolates the admin surface from Delivery).
const controlRunner = new BunRunner();
const auth = new LocalAuthentication<CMS_ROLES>({
    providerId:    "local",
    loginPagePath: "/login",
    logoutPath:    "/auth/logout",
    credentials, resolver, codec, pats,
    rateLimit,
    cookieName:    "cms-session",
    cookieSecure,
    defaultHome:   "/admin/pages",
});
const controlCms = new ControlCms(controlRunner, repo, auth, {}, cache, secrets, filesMetadata, filesBlob, users, identityProviders, pats, credentials, gateway, analytics, roles, { local: auth });
await controlCms.ready;

// Delivery on its own runner/port — strictly public surface. Shares the SAME
// gateway instance as Control, so providers created in the admin are immediately
// resolvable by the `/.cms/gateway/*` proxy.
const deliveryRunner = new BunRunner();
new DeliveryCms({ runner: deliveryRunner, repository: repo, cache, gateway, analytics, analyticsSalt: ANALYTICS_SALT_SECRET, filesMetadata, filesBlob, variantStore });

controlRunner.start(CONTROL_PORT);
deliveryRunner.start(DELIVERY_PORT);

console.log(`🚀 CMS listening`);
console.log(`   admin:        ${CONTROL_PUBLIC_URL}/admin/`);
console.log(`   sign in:      ${CONTROL_PUBLIC_URL}/login`);
console.log(`   public site:  ${DELIVERY_PUBLIC_URL}/`);
console.log(`   storage:      mongo=${db.databaseName}, files=${CMS_FILES_DIR}`);
