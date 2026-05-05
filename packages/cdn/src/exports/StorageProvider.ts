import { join } from "node:path";

import type { Runner, Authentication } from "@bernouy/core";
import { serveApi } from "@bernouy/core";
import type { BucketRepository } from "../interfaces/repositories/BucketRepository";
import type { BucketCredentialRepository } from "../interfaces/repositories/BucketCredentialRepository";
import type { PreSignedTokenRepository } from "../interfaces/repositories/PreSignedTokenRepository";
import type { AliasRepository } from "../interfaces/repositories/AliasRepository";
import type { AliasCertPath } from "../core/nginx/regenerateAliases";
import type { LegoIssuerConfig } from "../core/alias/issueLegoCert";
import type { StoredFolderRepository } from "../interfaces/repositories/StoredFolderRepository";
import type { StoredFileRepository } from "../interfaces/repositories/StoredFileRepository";
import type { BlobStorage } from "../interfaces/BlobStorage";
import { createAdminGuard } from "../core/authentication/createAdminGuard";
import { createBrokerGuard } from "../core/authentication/createBrokerGuard";
import { mountAdminSurface } from "../core/admin/mountAdminSurface";
import handleUpload from "../api/upload.post";
import handleUploadOptions from "../api/upload.options";
import { cdnPackageRoot } from "../constants";

export type StorageProviderConfig = {
    /** When set, bucket / alias changes regenerate the corresponding Nginx
     *  fragments and reload. Leave undefined for tests / dev where Nginx
     *  isn't running. */
    nginx?: {
        cacheControlsPath: string;
        /** Path to the `aliases.conf` map fragment (`<host> <bucketId>;`). */
        aliasesPath?: string;
        /** Path to the `aliasesServers.conf` per-alias `server { … }` fragment. */
        aliasesServersPath?: string;
        /** Path passed to the `include …;` directive of each alias server block. */
        bucketServingIncludePath?: string;
        /** Resolves the cert + key pair for an alias domain. Defaults to lego's layout. */
        aliasCertPath?: AliasCertPath;
        binary?: string;
    };
    /** Origin (`https://host`, no trailing slash) used when building public file
     *  URLs. Receives the bucket id; defaults to
     *  `https://${bucketId}.cdn.bernouy.com`. */
    publicHost?: (bucketId: string) => string;
    /** When set, the admin "+ New alias" flow can issue a TLS cert via `lego`
     *  before writing the alias row. Also used by `renewAllAliases` (cron). */
    aliasIssuer?: LegoIssuerConfig;
};

export type StorageProviderDeps = {
    runner: Runner;
    authentication: Authentication;
    bucketRepo: BucketRepository;
    bucketCredentialRepo: BucketCredentialRepository;
    preSignedTokenRepo: PreSignedTokenRepository;
    aliasRepo: AliasRepository;
    storedFolderRepo: StoredFolderRepository;
    storedFileRepo: StoredFileRepository;
    blobStorage: BlobStorage;
    config?: StorageProviderConfig;
};

export class StorageProvider {

    private _runner:               Runner;
    private _auth:                 Authentication;
    private _bucketRepo:           BucketRepository;
    private _bucketCredentialRepo: BucketCredentialRepository;
    private _preSignedTokenRepo:   PreSignedTokenRepository;
    private _aliasRepo:            AliasRepository;
    private _storedFolderRepo:     StoredFolderRepository;
    private _storedFileRepo:       StoredFileRepository;
    private _blobStorage:          BlobStorage;
    private _config:               StorageProviderConfig;

    constructor(deps: StorageProviderDeps) {
        this._runner               = deps.runner;
        this._auth                 = deps.authentication;
        this._bucketRepo           = deps.bucketRepo;
        this._bucketCredentialRepo = deps.bucketCredentialRepo;
        this._preSignedTokenRepo   = deps.preSignedTokenRepo;
        this._aliasRepo            = deps.aliasRepo;
        this._storedFolderRepo     = deps.storedFolderRepo;
        this._storedFileRepo       = deps.storedFileRepo;
        this._blobStorage          = deps.blobStorage;
        this._config               = deps.config ?? {};

        const adminGuard  = createAdminGuard(this._auth);
        const brokerGuard = createBrokerGuard(this._bucketCredentialRepo);

        this._runner.group("/admin", (admin) => mountAdminSurface(admin, this), [adminGuard]);
        this._runner.group("/api",   (api)   => serveApi(api, join(cdnPackageRoot, "src/api/broker"), this), [brokerGuard]);
        this._runner.post       ("/upload", (req) => handleUpload(req, this));
        this._runner.addEndpoint("OPTIONS", "/upload", (req) => handleUploadOptions(req, this));
    }

    get runner()               { return this._runner; }
    get auth()                 { return this._auth; }
    get bucketRepo()           { return this._bucketRepo; }
    get bucketCredentialRepo() { return this._bucketCredentialRepo; }
    get preSignedTokenRepo()   { return this._preSignedTokenRepo; }
    get aliasRepo()            { return this._aliasRepo; }
    get storedFolderRepo()     { return this._storedFolderRepo; }
    get storedFileRepo()       { return this._storedFileRepo; }
    get blobStorage()          { return this._blobStorage; }
    get config()               { return this._config; }
}
