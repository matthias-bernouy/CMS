import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import type { Authentication } from "@bernouy/core";
import {
    StorageProvider, StorageTokenBroker,
    LocalBlobStorage,
    MongoBucketRepository,           type BucketDocument,
    MongoBucketCredentialRepository, type BucketCredentialDocument,
    MongoPreSignedTokenRepository,   type PreSignedTokenDocument,
    MongoAliasRepository,            type AliasDocument,
    MongoStoredFolderRepository,     type StoredFolderDocument,
    MongoStoredFileRepository,       type StoredFileDocument,
} from "@bernouy/cdn";

const mongo = new MongoClient("mongodb://localhost:27017");
await mongo.connect();
const db = mongo.db("basic_storage_b");

const runner = new BunRunner();

const devAuth: Authentication = {
    loginUrl:       "/login",
    logoutUrl:      "/logout",
    profileUrl:     "/profile",
    buildLoginUrl:  (r) => `/login?returnTo=${encodeURIComponent(r)}`,
    buildLogoutUrl: (r) => `/logout?returnTo=${encodeURIComponent(r)}`,
    getSubject:     async () => ({ identifier: "dev", role: "admin", displayName: "Dev" }),
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
    blobStorage:          new LocalBlobStorage("/tmp/basic-storage-buckets"),
    config: {
        nginx: {
            cacheControlsPath: "/etc/nginx/conf.d/basic-storage/generated/cacheControls.conf",
            binary:            "sudo /usr/sbin/nginx",
        },
        publicHost: (bucketId) => `http://${bucketId}.cdn.localhost`,
    },
});

new StorageTokenBroker({
    runner,
    providerOrigin:  "http://cdn.localhost:3005",
    credentialToken: "bsp_nJep_BncaJD86dJDI1QTf2r_NIjv0Mt0XNrbkLALFgE",
});

runner.start(3005);
