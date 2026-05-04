// Example bootstrap — env-driven. Replace `devAuth` with your real
// `Authentication` impl BEFORE exposing publicly.

import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import type { Authentication } from "@bernouy/core";
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
    if (!v) throw new Error(`Missing env var: ${k}`);
    return v;
};

const MONGODB_URI       = required("MONGODB_URI");
const MAIN_DOMAIN       = required("MAIN_DOMAIN");
const LEGO_EMAIL        = required("LEGO_EMAIL");
const LEGO_DNS_PROVIDER = process.env.LEGO_DNS_PROVIDER ?? "";
const PORT              = Number(process.env.PORT ?? 3000);

const mongo = new MongoClient(MONGODB_URI);
await mongo.connect();
const db = mongo.db("cdn");

const runner = new BunRunner();

// ⚠️  Dev mock — admits every caller as admin. Replace with Keycloak / OAuth
//   / your own session provider before exposing to the internet.
const devAuth: Authentication = {
    loginUrl: "/login", logoutUrl: "/logout", profileUrl: "/profile",
    buildLoginUrl:  (r) => `/login?returnTo=${encodeURIComponent(r)}`,
    buildLogoutUrl: (r) => `/logout?returnTo=${encodeURIComponent(r)}`,
    getSubject: async () => ({ identifier: "dev", role: "admin", displayName: "Dev" }),
};

new StorageProvider({
    runner,
    authentication:       devAuth,
    bucketRepo:           new MongoBucketRepository          (db.collection<BucketDocument>           ("buckets")),
    bucketCredentialRepo: new MongoBucketCredentialRepository(db.collection<BucketCredentialDocument> ("bucket_credentials")),
    preSignedTokenRepo:   new MongoPreSignedTokenRepository  (db.collection<PreSignedTokenDocument>   ("pre_signed_tokens")),
    aliasRepo:            new MongoAliasRepository           (db.collection<AliasDocument>            ("aliases")),
    storedFolderRepo:     new MongoStoredFolderRepository    (db.collection<StoredFolderDocument>     ("stored_folders")),
    storedFileRepo:       new MongoStoredFileRepository      (db.collection<StoredFileDocument>       ("stored_files")),
    blobStorage:          new LocalBlobStorage("/var/storage/buckets"),
    config: {
        nginx: {
            cacheControlsPath:        "/etc/nginx/conf.d/cdn/generated/cacheControls.conf",
            aliasesPath:              "/etc/nginx/conf.d/cdn/generated/aliases.conf",
            aliasesServersPath:       "/etc/nginx/conf.d/cdn/generated/aliasesServers.conf",
            bucketServingIncludePath: "/etc/nginx/conf.d/cdn/bucketServing.conf",
            binary:                   "sudo /usr/sbin/nginx",
        },
        publicHost: (b) => `https://${b}.${MAIN_DOMAIN}`,
        ...(LEGO_DNS_PROVIDER ? {
            aliasIssuer: {
                email:       LEGO_EMAIL,
                challenge:   "dns" as const,
                dnsProvider: LEGO_DNS_PROVIDER,
                env:         pickLegoEnv(),
            },
        } : {}),
    },
});

runner.start(PORT);
console.log(`✅ cdn app listening on :${PORT}`);

/** Forwards DNS-provider env vars to lego when minting per-alias certs.
 *  Extend the prefix list as needed — see https://go-acme.github.io/lego/dns/ */
function pickLegoEnv(): Record<string, string> {
    const PREFIXES = /^(OVH|AWS|CLOUDFLARE|GANDI|GANDIV5|GCLOUD|DIGITALOCEAN|HETZNER|LINODE|NS1|ROUTE53|SCALEWAY|VULTR)_/;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined && PREFIXES.test(k)) out[k] = v;
    }
    return out;
}
