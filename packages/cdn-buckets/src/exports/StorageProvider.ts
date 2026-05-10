import { join } from "node:path";

import type { Runner, Authentication, Subject } from "@bernouy/core";
import { serveApi, CredentialAuthentication, requireRole } from "@bernouy/core";
import type { BucketRepository } from "../interfaces/repositories/BucketRepository";
import type { BucketCredentialRepository } from "../interfaces/repositories/BucketCredentialRepository";
import type { BucketCredential } from "../interfaces/entities/BucketCredential";
import type { PreSignedTokenRepository } from "../interfaces/repositories/PreSignedTokenRepository";
import type { AliasRepository } from "../interfaces/repositories/AliasRepository";
import type { AliasCertPath } from "../core/nginx/regenerateAliases";
import type { LegoIssuerConfig } from "../core/alias/issueLegoCert";
import type { StoredFolderRepository } from "../interfaces/repositories/StoredFolderRepository";
import type { StoredFileRepository } from "../interfaces/repositories/StoredFileRepository";
import type { DekRepository } from "@bernouy/core";
import type { BucketProxyRepository } from "../interfaces/repositories/BucketProxyRepository";
import type { SecretCrypto } from "@bernouy/core";
import type { BlobStorage } from "../interfaces/BlobStorage";
import { createAdminGuard } from "../core/authentication/createAdminGuard";
import { mountAdminSurface } from "../core/admin/mountAdminSurface";
import { applyBucketChanges } from "../core/nginx/applyBucketChanges";
import { applyAliasChanges } from "../core/nginx/applyAliasChanges";
import handleUpload from "../api/upload.post";
import handleUploadOptions from "../api/upload.options";
import { cdnPackageRoot } from "../constants";

export type StorageProviderConfig = {
    /** When set, bucket / alias changes regenerate the corresponding Nginx
     *  fragments and reload. Leave undefined for tests / dev where Nginx
     *  isn't running. */
    nginx?: {
        cacheControlsPath: string;
        /** Path to the `notFoundPaths.conf` map fragment (`<bucketId> "<file>";`),
         *  consumed by an outer `map $bucket_id $bucket_notfound { … }` block. */
        notFoundPathsPath?: string;
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
    /** Auth for the `/admin/*` surface. Typically a `CompositeAuthentication` of
     *  Keycloak cookie + bearer JWT (the bearer leg accepts service-account tokens
     *  from a "central hub"). Composed externally by the bootstrap. */
    authentication: Authentication;
    bucketRepo: BucketRepository;
    bucketCredentialRepo: BucketCredentialRepository;
    preSignedTokenRepo: PreSignedTokenRepository;
    aliasRepo: AliasRepository;
    storedFolderRepo: StoredFolderRepository;
    storedFileRepo: StoredFileRepository;
    /** Per-bucket DEK store. Required: every secret persisted by the
     *  provider (currently `BucketProxy.auth`) is wrapped against the
     *  bucket's DEK before reaching Mongo. */
    bucketDekRepo: DekRepository;
    /** Proxy rules attached to a bucket — exposes per-bucket
     *  `/.cms/data/<providerId>/*` routes on cdn-edge. */
    bucketProxyRepo: BucketProxyRepository;
    /** Envelope encryption surface used by `bucketProxyRepo` and any
     *  future repository that persists user-supplied secrets. */
    secretCrypto: SecretCrypto;
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
    private _bucketDekRepo:        DekRepository;
    private _bucketProxyRepo:      BucketProxyRepository;
    private _secretCrypto:         SecretCrypto;
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
        this._bucketDekRepo        = deps.bucketDekRepo;
        this._bucketProxyRepo      = deps.bucketProxyRepo;
        this._secretCrypto         = deps.secretCrypto;
        this._blobStorage          = deps.blobStorage;
        this._config               = deps.config ?? {};

        const brokerAuth = new CredentialAuthentication<BucketCredential, "tenant">(
            this._bucketCredentialRepo,
            (cred): Subject<"tenant"> => ({
                identifier: cred.id,
                role:       "tenant",
                ...(cred.label !== undefined ? { displayName: cred.label } : {}),
            }),
        );
        const adminGuard  = createAdminGuard(this._auth);
        const brokerGuard = requireRole(brokerAuth, "tenant");

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
    get bucketDekRepo()        { return this._bucketDekRepo; }
    get bucketProxyRepo()      { return this._bucketProxyRepo; }
    get secretCrypto()         { return this._secretCrypto; }
    get blobStorage()          { return this._blobStorage; }
    get config()               { return this._config; }

    /**
     * Regenerate every nginx fragment from the current DB state and reload
     * nginx. Idempotent. Use case: container restart — the generated/*
     * files live inside the image (not the volume), so a fresh container
     * boots with empty fragments until something rewrites them. Call this
     * once at startup to repaint everything.
     */
    async regenerateAllNginx(): Promise<void> {
        await applyBucketChanges(this);
        await applyAliasChanges(this);
    }
}
