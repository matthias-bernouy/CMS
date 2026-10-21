import { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/cms-repository/collections/mongo";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { PageRouteMutationCoordinator, validatePageLinks, withSitePageRoutes } from "@bernouy/cms-content";
import {
    synchronizePageRoutes,
    withCollectionPageRoutes,
    withInstalledCollections,
} from "@bernouy/cms-repository/collections/content";
import {
    CollectionMigrationService,
    withCollectionMigrationWriteFence,
} from "@bernouy/cms-repository/collections/installations";
import {
    MongoAuthTokenStore,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoUsersRepository,
} from "@bernouy/cms-auth/mongo";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { MongoCmsRepository, MongoPageRouteRegistry } from "@bernouy/cms-content/mongo";
import { MongoCollectionMigrationStorage } from "@bernouy/cms-repository/collections/mongo";
import { createFieldCrypto } from "@bernouy/envelope-crypto/mongo";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import { MongoClient } from "mongodb";
import type { RuntimeKekConfig } from "../../runtimeEnvKek";
import { CMS_REPOSITORY_FENCED_MUTATIONS, COLLECTION_STORE_FENCED_MUTATIONS } from "./migrationWritePolicy";
import { createEnvelopeSecretCrypto } from "./envelopeCrypto";
import { CmsFilesService, CmsImageDerivatives } from "@bernouy/cms-files";
import { MongoCmsFilesStore } from "@bernouy/cms-files/mongo";
import { LocalFsBlobStore } from "@bernouy/blob-store/local-fs";
import { join } from "node:path";
import { SharpImageTransformer } from "@bernouy/image-processing/sharp";
import { MongoIdentityService } from "@bernouy/cms-gateway/identity/mongo";
import {
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/cms-repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/cms-repository/providers/selections";
import { selectedCapabilityResolver, selectedPublicSvgCapabilityValidator } from "./selectedQueryCapabilities";
import type { Logger } from "@bernouy/logging";

const SCOPE_ID = "default";

export type ProviderStoreConfig = Readonly<{
    MONGO_URL: string;
    CMS_KEK: RuntimeKekConfig;
    CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: number;
    CMS_FILES_DIR: string;
    CMS_SESSION_SECRET: string;
    KERNEL_PUBLIC_URL: string;
}>;

export async function createProviderStores(env: ProviderStoreConfig, logger: Logger) {
    const mongo = new MongoClient(env.MONGO_URL);
    await mongo.connect();
    const db = mongo.db();
    const releases = new MongoReleaseCatalogue(db);
    const manifests = new MongoProviderManifestCatalogue(db, releases);
    const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    await installations.init();
    const selections = new MongoContractSelectionStore(
        db,
        new CatalogueSelectionDependencies(releases, manifests, installations),
    );

    const secretCrypto = await createEnvelopeSecretCrypto(db, env.CMS_KEK).catch(async (error) => {
        await mongo.close();
        throw error;
    });
    const fieldCrypto = await createFieldCrypto(SCOPE_ID, secretCrypto, db);

    const innerRepo = new MongoCmsRepository(db);
    await innerRepo.init();
    const collectionStorage = new MongoCollectionStorage(db);
    await collectionStorage.init();
    const rawCollections = new CollectionStore(collectionStorage, releases);
    const pageRoutes = new MongoPageRouteRegistry(db);
    const pageRouteMutations = new PageRouteMutationCoordinator();
    await synchronizePageRoutes(
        pageRoutes,
        SCOPE_ID,
        await rawCollections.snapshot(SCOPE_ID),
        await innerRepo.getAllPages(),
    );
    const migrationCollections = withCollectionPageRoutes(rawCollections, pageRoutes, {
        coordinator: pageRouteMutations,
        getSitePages: () => innerRepo.getAllPages(),
        resolveSitePath: async (path) => {
            const route = await innerRepo.getPageRoute(path);
            return route !== null && route.state !== "gone";
        },
    });
    const validatedRepo = new ValidatingCmsRepository(
        withInstalledCollections(innerRepo, migrationCollections, SCOPE_ID, pageRoutes),
        {
            resolveCapabilities: selectedCapabilityResolver(SCOPE_ID, selections, releases),
            requireQueryCapabilityResolution: true,
            validateSvgCapabilities: selectedPublicSvgCapabilityValidator(SCOPE_ID, selections, releases),
            requireSvgCapabilityResolution: true,
        },
    );
    await validatePageLinks(validatedRepo, pageRoutes, SCOPE_ID);
    const migrationRepo = withSitePageRoutes(validatedRepo, pageRoutes, SCOPE_ID, pageRouteMutations);
    const migrationStorage = new MongoCollectionMigrationStorage(db);
    await migrationStorage.init();
    const collectionMigrations = new CollectionMigrationService(migrationRepo, migrationCollections, migrationStorage, {
        rollbackRetentionCount: env.CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION,
        onRetentionError: (error) => logger.error("collection.migration.retention.failed", {}, error),
    });
    const repo = withCollectionMigrationWriteFence(
        migrationRepo,
        migrationStorage,
        SCOPE_ID,
        CMS_REPOSITORY_FENCED_MUTATIONS,
    );
    const collections = withCollectionMigrationWriteFence(
        migrationCollections,
        migrationStorage,
        (_method, args) => String(args[0]),
        COLLECTION_STORE_FENCED_MUTATIONS,
    );
    const providerFilesStore = new MongoCmsFilesStore(db);
    await providerFilesStore.init();
    const signingKey = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.CMS_SESSION_SECRET + ":cms-files")),
    );
    const providerBlobs = new LocalFsBlobStore(join(env.CMS_FILES_DIR, "blobs"));
    const providerFiles = new CmsFilesService({
        store: providerFilesStore,
        blobs: providerBlobs,
        signingKey,
        publicBaseUrl: env.KERNEL_PUBLIC_URL,
        derivatives: new CmsImageDerivatives({
            store: providerFilesStore,
            blobs: providerBlobs,
            transformer: new SharpImageTransformer(),
            reportError: (error) => logger.error("file.image.derivative.failed", {}, error),
        }),
    });

    const users = new MongoUsersRepository(db, fieldCrypto);
    const credentials = new MongoLocalCredentialStore(db, fieldCrypto);
    await credentials.init();
    const pats = new MongoPatRepository(db);
    await pats.init();
    const authTokens = new MongoAuthTokenStore(db);
    await authTokens.init();
    const rateLimit = new MongoRateLimiter(db, { limit: 8, windowSeconds: 300 });
    await rateLimit.init();
    const secrets = new ValidatingSecretStore(
        new EncryptedMongoSecretStore({
            scopeId: SCOPE_ID,
            collection: db.collection("cms_secrets"),
            secretCrypto,
        }),
    );
    const identities = new MongoIdentityService(db);
    await identities.init();

    return {
        runtimeSessionSecret: env.CMS_SESSION_SECRET,
        collections,
        pageRoutes,
        collectionMigrations,
        migrationStorage,
        mongo,
        db,
        repo,
        providerFiles,
        users,
        credentials,
        pats,
        authTokens,
        rateLimit,
        secrets,
        identities,
        releases,
        manifests,
        installations,
        selections,
        sitemapStore: new LocalFsBlobStore(join(env.CMS_FILES_DIR, "sitemaps")),
        close: () => mongo.close(),
    };
}

export type ProviderStores = Awaited<ReturnType<typeof createProviderStores>>;
