// Origin bootstrap — composes @bernouy/cdn-buckets's StorageProvider with
// @bernouy/cdn-node's OriginProvider on the same Bun runner, behind a
// Keycloak admin guard. Driven entirely by env vars — see
// ../docker/cdn-origin/README.md.

import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import type { Subject, Middleware } from "@bernouy/core";
import { KeycloakConsumer, KeycloakBearerConsumer } from "@bernouy/auth-keycloak";
import { CompositeAuthentication } from "@bernouy/auth-composite";
import {
    StorageProvider,
    LocalBlobStorage,
    MongoBucketRepository,           type BucketDocument,
    MongoBucketCredentialRepository, type BucketCredentialDocument,
    MongoPreSignedTokenRepository,   type PreSignedTokenDocument,
    MongoAliasRepository,            type AliasDocument,
    MongoStoredFolderRepository,     type StoredFolderDocument,
    MongoStoredFileRepository,       type StoredFileDocument,
    MongoBucketDekRepository,        type BucketDekDocument,
    MongoBucketProxyRepository,      type BucketProxyDocument,
    loadKek,
} from "@bernouy/cdn-buckets";
import { EnvelopeSecretCrypto, LocalKekProvider } from "@bernouy/core";
import {
    OriginProvider,
    MongoEdgeRepository,             type EdgeDocument,
    MongoAccessMetricsRepository,
    type AccessMetricDocument,
    type ProcessedLogFileDocument,
} from "@bernouy/cdn-node";

const required = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
};
const env = (k: string, d: string): string => process.env[k] ?? d;

const MAIN_DOMAIN              = required("MAIN_DOMAIN");
// Public host the edges serve (e.g. `cdn-edge.bernouy.com`). Different
// from MAIN_DOMAIN: MAIN_DOMAIN is the origin's admin host, PUBLIC_DOMAIN
// is what end-users hit to read bucket files. Bucket URLs are
// `https://<PUBLIC_DOMAIN>/<bucketId>/...` (path-based — no wildcard
// cert needed; clients with custom domains use the alias system).
const PUBLIC_DOMAIN            = required("PUBLIC_DOMAIN");
const LEGO_EMAIL               = required("LEGO_EMAIL");
const LEGO_SERVER              = process.env.LEGO_SERVER ?? "";

const KEYCLOAK_ISSUER          = required("KEYCLOAK_ISSUER");
const KEYCLOAK_CLIENT_ID       = required("KEYCLOAK_CLIENT_ID");
const KEYCLOAK_CLIENT_SECRET   = required("KEYCLOAK_CLIENT_SECRET");
const KEYCLOAK_SESSION_SECRET  = required("KEYCLOAK_SESSION_SECRET");
const KEYCLOAK_ADMIN_ROLE      = env("KEYCLOAK_ADMIN_ROLE", "admin");

const PORT = Number(process.env.PORT ?? 3000);

const MONGO_URL     = required("MONGO_URL");
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "cdn";

const SSH_KEY_PATH       = env("SSH_KEY_PATH",       "/var/lib/cdn/ssh/id_ed25519");
const LSYNCD_CONFIG_PATH = env("LSYNCD_CONFIG_PATH", "/etc/lsyncd/lsyncd.conf.lua");
const LSYNCD_STATUS_PATH = env("LSYNCD_STATUS_PATH", "/var/lib/cdn/lsyncd/status");
const LSYNCD_LOG_PATH    = env("LSYNCD_LOG_PATH",    "/var/lib/cdn/lsyncd/lsyncd.log");
const LSYNCD_RELOAD_CMD  = env("LSYNCD_RELOAD_CMD",  "/usr/local/bin/lsyncd-reload.sh");

const LOGS_LOCAL_DIR     = env("LOGS_LOCAL_DIR",     "/var/lib/cdn/access-logs");
const LOGS_REMOTE_PATH   = env("LOGS_REMOTE_PATH",   "/var/lib/cdn/access-logs");
const LOGS_INTERVAL_MS   = Number(env("LOGS_INTERVAL_MS", String(15 * 60_000)));

const mongo = new MongoClient(MONGO_URL);
await mongo.connect();
const db = mongo.db(MONGO_DB_NAME);

const runner = new BunRunner();

const claimsToSubject = (claims: Record<string, unknown>): Subject => {
    const realmRoles = ((claims as { realm_access?: { roles?: string[] } }).realm_access?.roles) ?? [];
    const role: Subject["role"] = realmRoles.includes(KEYCLOAK_ADMIN_ROLE) ? "admin" : "user";
    return {
        identifier:  String(claims.sub ?? ""),
        displayName: String(claims.preferred_username ?? claims.email ?? "user"),
        role,
    };
};

const cookieAuth = new KeycloakConsumer(runner, {
    issuer:        KEYCLOAK_ISSUER,
    clientId:      KEYCLOAK_CLIENT_ID,
    clientSecret:  KEYCLOAK_CLIENT_SECRET,
    appBaseUrl:    `https://${MAIN_DOMAIN}`,
    sessionSecret: KEYCLOAK_SESSION_SECRET,
    claimsToSubject,
});

// Bearer JWT validation against the same realm. Lets a service account
// (typically the central hub's `hub-orchestrator` client, granted the
// realm role configured by KEYCLOAK_ADMIN_ROLE) authenticate as `admin`
// on `/admin/*` for machine-to-machine provisioning calls.
const bearerAuth = new KeycloakBearerConsumer({
    issuer:          KEYCLOAK_ISSUER,
    claimsToSubject,
});

const auth = new CompositeAuthentication(runner, {
    children: [
        { auth: bearerAuth },                         // bearer first → short-circuits cookie lookup for API clients
        { auth: cookieAuth, displayName: "Keycloak" },
    ],
});

const bucketDekRepo = new MongoBucketDekRepository(db.collection<BucketDekDocument>("bucket_deks"));
const secretCrypto  = new EnvelopeSecretCrypto(new LocalKekProvider(loadKek(process.env.CDN_BUCKETS_KEK)), bucketDekRepo);

const provider = new StorageProvider({
    runner,
    authentication:       auth,
    bucketRepo:           new MongoBucketRepository          (db.collection<BucketDocument>           ("buckets")),
    bucketCredentialRepo: new MongoBucketCredentialRepository(db.collection<BucketCredentialDocument> ("bucket_credentials")),
    preSignedTokenRepo:   new MongoPreSignedTokenRepository  (db.collection<PreSignedTokenDocument>   ("pre_signed_tokens")),
    aliasRepo:            new MongoAliasRepository           (db.collection<AliasDocument>            ("aliases")),
    storedFolderRepo:     new MongoStoredFolderRepository    (db.collection<StoredFolderDocument>     ("stored_folders")),
    storedFileRepo:       new MongoStoredFileRepository      (db.collection<StoredFileDocument>       ("stored_files")),
    bucketDekRepo,
    bucketProxyRepo:      new MongoBucketProxyRepository     (db.collection<BucketProxyDocument>      ("bucket_proxies"), secretCrypto),
    secretCrypto,
    blobStorage:          new LocalBlobStorage("/var/lib/cdn/buckets"),
    config: {
        nginx: {
            // Generated fragments live UNDER the volume so lsyncd pushes
            // them to every edge alongside the blobs. The origin's own
            // nginx.conf.template does NOT include them — origin doesn't
            // serve buckets publicly. Edges are the consumers.
            cacheControlsPath:        "/var/lib/cdn/nginx-generated/cacheControls.conf",
            notFoundPathsPath:        "/var/lib/cdn/nginx-generated/notFoundPaths.conf",
            aliasesPath:              "/var/lib/cdn/nginx-generated/aliases.conf",
            aliasesServersPath:       "/var/lib/cdn/nginx-generated/aliasesServers.conf",
            bucketServingIncludePath: "/etc/nginx/conf.d/cdn/bucketServing.conf",
            aliasCertPath:            (domain) => ({
                cert: `/var/lib/cdn/lego/certificates/${domain}.crt`,
                key:  `/var/lib/cdn/lego/certificates/${domain}.key`,
            }),
            binary:                   "sudo /usr/sbin/nginx",
        },
        publicHost: (b) => `https://${PUBLIC_DOMAIN}/${b}`,
        // Per-alias certs use HTTP-01 (clients CNAME their alias to an
        // edge; the edge `proxy_pass /.well-known/acme-challenge/` back
        // to this origin so lego on the origin serves the challenge
        // file). Cert for MAIN_DOMAIN itself is issued by the entrypoint
        // via DNS-01 (origin is private — no public HTTP-01 path).
        aliasIssuer: {
            email:       LEGO_EMAIL,
            challenge:   "http" as const,
            httpWebroot: "/var/lib/cdn/lego/webroot",
            storePath:   "/var/lib/cdn/lego",
            ...(LEGO_SERVER ? { server: LEGO_SERVER } : {}),
        },
    },
});

await provider.regenerateAllNginx();

// Mirror @bernouy/cdn-buckets's `createAdminGuard` so a single Keycloak session
// covers /admin/buckets AND /admin/origin. Inlined here because cdn
// does not export the helper. CSRF: mutating cross-origin requests are
// dropped (same-origin only). 302 to login on browser nav, JSON 401/403
// for API calls.
const adminGuard: Middleware = async (req, next) => {
    const url = new URL(req.url);
    const isApi = url.pathname.startsWith("/admin/origin/api/");

    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const origin = req.headers.get("origin") || req.headers.get("referer");
        if (origin) {
            try {
                if (new URL(origin).host !== url.host) {
                    return new Response("CSRF: cross-origin request blocked", { status: 403 });
                }
            } catch {
                return new Response("CSRF: invalid origin", { status: 403 });
            }
        }
    }

    const subject = await auth.getSubject(req);
    if (!subject) {
        if (isApi) return Response.json({ ok: false, error: { code: "unauthorized", message: "Not authenticated." } }, { status: 401 });
        return new Response(null, { status: 302, headers: { Location: auth.buildLoginUrl(url.pathname) } });
    }
    if (subject.role !== "admin") {
        if (isApi) return Response.json({ ok: false, error: { code: "forbidden", message: "Admin role required." } }, { status: 403 });
        return new Response("Forbidden", { status: 403 });
    }
    return next();
};

const originProvider = new OriginProvider({
    runner,
    authentication: auth,
    edgeRepo:       new MongoEdgeRepository(db.collection<EdgeDocument>("cdn_edges")),
    accessMetricsRepo: new MongoAccessMetricsRepository(
        db.collection<AccessMetricDocument>     ("cdn_access_metrics"),
        db.collection<ProcessedLogFileDocument> ("cdn_access_metrics_files"),
    ),
    bucketProxyRepo: provider.bucketProxyRepo,
    adminGuard,
    config: {
        lsyncd: {
            // Sync the whole volume root — the generator's `RSYNC_EXCLUDES`
            // filter strips origin-private dirs (ssh, lsyncd, backups,
            // lego/webroot, lego/accounts) and edge-private dirs (lego-edge,
            // sshd). Edges receive buckets/, lego/certificates/ and
            // nginx-generated/.
            sourcePath: "/var/lib/cdn",
            sshKeyPath: SSH_KEY_PATH,
            configPath: LSYNCD_CONFIG_PATH,
            statusPath: LSYNCD_STATUS_PATH,
            logPath:    LSYNCD_LOG_PATH,
            reloadCmd:  LSYNCD_RELOAD_CMD,
        },
        probe: { sshKeyPath: SSH_KEY_PATH },
        logs: {
            sshKeyPath: SSH_KEY_PATH,
            localDir:   LOGS_LOCAL_DIR,
            remotePath: LOGS_REMOTE_PATH,
            intervalMs: LOGS_INTERVAL_MS,
        },
    },
});
// Repaint lsyncd config from DB. /etc/lsyncd/lsyncd.conf.lua lives in
// the image (not the volume), so a fresh container boots without it —
// without this call lsyncd-supervisor would sleep until something else
// triggers a write.
await originProvider.regenerateLsyncd();
// Start the in-process loop that periodically pulls each edge's
// rotated access-log archives via SSH+rsync.
originProvider.startLogPullerLoop();

runner.start(PORT);
console.log(`✅ cdn-origin listening on :${PORT} (auth: ${KEYCLOAK_ISSUER})`);
