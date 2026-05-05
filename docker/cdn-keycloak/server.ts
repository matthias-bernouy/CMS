// All-in-one CDN bootstrap with Keycloak auth wired in.
// Driven entirely by env vars — see ../docker/cdn-keycloak/README.md.

import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import type { Subject } from "@bernouy/core";
import { KeycloakConsumer } from "@bernouy/auth-keycloak";
import {
    StorageProvider,
    LocalBlobStorage,
    MongoBucketRepository,           type BucketDocument,
    MongoBucketCredentialRepository, type BucketCredentialDocument,
    MongoPreSignedTokenRepository,   type PreSignedTokenDocument,
    MongoAliasRepository,            type AliasDocument,
    MongoStoredFolderRepository,     type StoredFolderDocument,
    MongoStoredFileRepository,       type StoredFileDocument,
} from "@bernouy/cdn";

const required = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
};
const env = (k: string, d: string): string => process.env[k] ?? d;

const MAIN_DOMAIN              = required("MAIN_DOMAIN");
const LEGO_EMAIL               = required("LEGO_EMAIL");
const LEGO_DNS_PROVIDER        = process.env.LEGO_DNS_PROVIDER ?? "";
const LEGO_SERVER              = process.env.LEGO_SERVER ?? "";

const KEYCLOAK_ISSUER          = required("KEYCLOAK_ISSUER");
const KEYCLOAK_CLIENT_ID       = required("KEYCLOAK_CLIENT_ID");
const KEYCLOAK_CLIENT_SECRET   = required("KEYCLOAK_CLIENT_SECRET");
const KEYCLOAK_SESSION_SECRET  = required("KEYCLOAK_SESSION_SECRET");
const KEYCLOAK_ADMIN_ROLE      = env("KEYCLOAK_ADMIN_ROLE", "admin");

const PORT = Number(process.env.PORT ?? 3000);

// MongoDB runs in the same container on 127.0.0.1:27017 (no auth — only
// reachable via loopback, never exposed off-container).
const mongo = new MongoClient("mongodb://127.0.0.1:27017");
await mongo.connect();
const db = mongo.db("cdn");

const runner = new BunRunner();

const auth = new KeycloakConsumer(runner, {
    issuer:        KEYCLOAK_ISSUER,
    clientId:      KEYCLOAK_CLIENT_ID,
    clientSecret:  KEYCLOAK_CLIENT_SECRET,
    appBaseUrl:    `https://${MAIN_DOMAIN}`,
    sessionSecret: KEYCLOAK_SESSION_SECRET,
    claimsToSubject: (claims) => {
        const realmRoles = ((claims as { realm_access?: { roles?: string[] } }).realm_access?.roles) ?? [];
        const role: Subject["role"] = realmRoles.includes(KEYCLOAK_ADMIN_ROLE) ? "admin" : "user";
        const subject: Subject = {
            identifier:  String(claims.sub ?? ""),
            displayName: String(claims.preferred_username ?? claims.email ?? "user"),
            role,
        };
        return subject;
    },
});

new StorageProvider({
    runner,
    authentication:       auth,
    bucketRepo:           new MongoBucketRepository          (db.collection<BucketDocument>           ("buckets")),
    bucketCredentialRepo: new MongoBucketCredentialRepository(db.collection<BucketCredentialDocument> ("bucket_credentials")),
    preSignedTokenRepo:   new MongoPreSignedTokenRepository  (db.collection<PreSignedTokenDocument>   ("pre_signed_tokens")),
    aliasRepo:            new MongoAliasRepository           (db.collection<AliasDocument>            ("aliases")),
    storedFolderRepo:     new MongoStoredFolderRepository    (db.collection<StoredFolderDocument>     ("stored_folders")),
    storedFileRepo:       new MongoStoredFileRepository      (db.collection<StoredFileDocument>       ("stored_files")),
    blobStorage:          new LocalBlobStorage("/var/lib/cdn/buckets"),
    config: {
        nginx: {
            cacheControlsPath:        "/etc/nginx/conf.d/cdn/generated/cacheControls.conf",
            aliasesPath:              "/etc/nginx/conf.d/cdn/generated/aliases.conf",
            aliasesServersPath:       "/etc/nginx/conf.d/cdn/generated/aliasesServers.conf",
            bucketServingIncludePath: "/etc/nginx/conf.d/cdn/bucketServing.conf",
            aliasCertPath:            (domain) => ({
                cert: `/var/lib/cdn/lego/certificates/${domain}.crt`,
                key:  `/var/lib/cdn/lego/certificates/${domain}.key`,
            }),
            binary:                   "sudo /usr/sbin/nginx",
        },
        publicHost: (b) => `https://${b}.${MAIN_DOMAIN}`,
        // Per-alias certs use HTTP-01 (clients CNAME to us, no DNS API
        // access on their side). Wildcard cert for our own *.MAIN_DOMAIN
        // stays on DNS-01 — handled by the entrypoint with `LEGO_DNS_PROVIDER`.
        aliasIssuer: {
            email:       LEGO_EMAIL,
            challenge:   "http" as const,
            httpWebroot: "/var/lib/cdn/lego/webroot",
            storePath:   "/var/lib/cdn/lego",
            ...(LEGO_SERVER ? { server: LEGO_SERVER } : {}),
        },
    },
});

runner.start(PORT);
console.log(`✅ cdn-keycloak listening on :${PORT} (auth: ${KEYCLOAK_ISSUER})`);

function pickLegoEnv(): Record<string, string> {
    const PREFIXES = /^(OVH|AWS|CLOUDFLARE|GANDI|GANDIV5|GCLOUD|DIGITALOCEAN|HETZNER|LINODE|NS1|ROUTE53|SCALEWAY|VULTR)_/;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined && PREFIXES.test(k)) out[k] = v;
    }
    return out;
}
