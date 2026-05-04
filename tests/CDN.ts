import { MongoClient } from "mongodb";
import { BunRunner, type Authentication } from "@bernouy/socle";
import { MongoBucketRepository, type BucketDocument } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoBucketRepository";
import { StorageProvider } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/exports/StorageProvider";
import { LocalBlobStorage } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/LocalBlobStorage";
import { MongoBucketCredentialRepository, type BucketCredentialDocument } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoBucketCredentialRepository";
import { MongoStoredFileRepository, type StoredFileDocument } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoStoredFileRepository";
import { MongoStoredFolderRepository, type StoredFolderDocument } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoStoredFolderRepository";
import { MongoPreSignedTokenRepository, type PreSignedTokenDocument } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoPreSignedTokenRepository";
import { MongoAliasRepository, type AliasDocument } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoAliasRepository";
import { StorageTokenBroker } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/exports/StorageTokenBroker";

const mongo = new MongoClient("mongodb://localhost:27017");
await mongo.connect();

const collection = mongo.db("basic_storage_b").collection<BucketDocument>("buckets");

const runner = new BunRunner();

const devAuth: Authentication = {
    loginUrl: "/login",
    logoutUrl: "/logout",
    profileUrl: "/profile",
    buildLoginUrl: (r) => `/login?returnTo=${encodeURIComponent(r)}`,
    buildLogoutUrl: (r) => `/logout?returnTo=${encodeURIComponent(r)}`,
    getSubject: async () => ({ identifier: "dev", role: "admin", displayName: "Dev" }),
};


const credColl = mongo.db("basic_storage_b").collection<BucketCredentialDocument>("bucket_credentials");

const folderColl = mongo.db("basic_storage_b").collection<StoredFolderDocument>("stored_folders");
const fileColl = mongo.db("basic_storage_b").collection<StoredFileDocument>("stored_files");
const tokenColl = mongo.db("basic_storage_b").collection<PreSignedTokenDocument>("pre_signed_tokens");
const aliasColl = mongo.db("basic_storage_b").collection<AliasDocument>("aliases");

new StorageProvider({
    runner,
    authentication: devAuth,
    storedFolderRepo: new MongoStoredFolderRepository(folderColl),
    storedFileRepo: new MongoStoredFileRepository(fileColl),
    bucketCredentialRepo: new MongoBucketCredentialRepository(credColl),
    preSignedTokenRepo: new MongoPreSignedTokenRepository(tokenColl),
    aliasRepo: new MongoAliasRepository(aliasColl),
    bucketRepo: new MongoBucketRepository(collection),
    blobStorage: new LocalBlobStorage("/tmp/basic-storage-buckets"),
    config: {
        nginx: {
            cacheControlsPath: "/etc/nginx/conf.d/basic-storage/generated/cacheControls.conf",
            binary: "sudo /usr/sbin/nginx",  // or your noop script
        },
        publicHost: (bucketId) => `http://${bucketId}.cdn.localhost`,
    },
});


 new StorageTokenBroker({                                  
      runner,                                                                                                                 
      providerOrigin: "http://cdn.localhost:3005",          
      credentialToken: "bsp_nJep_BncaJD86dJDI1QTf2r_NIjv0Mt0XNrbkLALFgE",                                                                                    
  });                                                                                                                         
  
  
runner.start(3005);