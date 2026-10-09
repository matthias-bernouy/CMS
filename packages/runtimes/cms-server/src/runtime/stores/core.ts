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
    MongoIdentityProviderRepository,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoUsersRepository,
} from "@bernouy/cms-auth/mongo";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { MongoCmsRepository, MongoSurfacePageRouteRegistry } from "@bernouy/cms-content/mongo";
import { MongoCollectionMigrationStorage } from "@bernouy/cms-repository/collections/mongo";
import { createFieldCrypto } from "@bernouy/envelope-crypto/mongo";
import { InMemoryCache } from "@bernouy/http-runner";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import { MongoClient } from "mongodb";
import type { RuntimeEnv } from "../../runtimeEnv";
import { MongoCoreOperationStore } from "../core-operations/MongoCoreOperationStore";
import { CMS_REPOSITORY_FENCED_MUTATIONS, COLLECTION_STORE_FENCED_MUTATIONS } from "./migrationWritePolicy";
import { createEnvelopeSecretCrypto } from "./envelopeCrypto";
import { CmsFilesService, CmsImageDerivatives } from "@bernouy/cms-files";
import { MongoCmsFilesStore } from "@bernouy/cms-files/mongo";
import { LocalFsBlobStore } from "@bernouy/blob-store/local-fs";
import { join } from "node:path";
import { SharpImageTransformer } from "@bernouy/image-processing/sharp";

const SCOPE_ID = "default";

export async function createCoreStores(env: RuntimeEnv) {
    const mongo = new MongoClient(env.MONGO_URL);
    await mongo.connect();
    const db = mongo.db();

    const secretCrypto = await createEnvelopeSecretCrypto(db, env.CMS_KEK).catch(async (error) => {
        await mongo.close();
        throw error;
    });
    const fieldCrypto = await createFieldCrypto(SCOPE_ID, secretCrypto, db);

    const innerRepo = new MongoCmsRepository(db);
    await innerRepo.init();
    const collectionStorage = new MongoCollectionStorage(db);
    await collectionStorage.init();
    const rawCollections = new CollectionStore(collectionStorage, new MongoReleaseCatalogue(db));
    const pageRoutes = new MongoSurfacePageRouteRegistry(db);
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
    });
    const validatedRepo = new ValidatingCmsRepository(
        withInstalledCollections(innerRepo, migrationCollections, SCOPE_ID),
    );
    await validatePageLinks(validatedRepo, pageRoutes, SCOPE_ID);
    const migrationRepo = withSitePageRoutes(validatedRepo, pageRoutes, SCOPE_ID, pageRouteMutations);
    const migrationStorage = new MongoCollectionMigrationStorage(db);
    await migrationStorage.init();
    const coreOperations = new MongoCoreOperationStore(db);
    await coreOperations.init();
    const collectionMigrations = new CollectionMigrationService(migrationRepo, migrationCollections, migrationStorage, {
        rollbackRetentionCount: env.CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION,
        onRetentionError: (error) => console.error("Collection migration retention cleanup failed", error),
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
    const sitemapStore = new LocalFsBlobStore(join(env.CMS_FILES_DIR, "sitemaps"));
    const providerFiles = new CmsFilesService({
        store: providerFilesStore,
        blobs: providerBlobs,
        signingKey,
        publicBaseUrl: env.DELIVERY_PUBLIC_URL,
        derivatives: new CmsImageDerivatives({
            store: providerFilesStore,
            blobs: providerBlobs,
            transformer: new SharpImageTransformer(),
            reportError: (error) => console.error("CMS file image derivative failed", error),
        }),
    });

    const users = new MongoUsersRepository(db, fieldCrypto);
    const identityProviders = new MongoIdentityProviderRepository(db);
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

    return {
        collections,
        pageRoutes,
        collectionMigrations,
        coreOperations,
        migrationStorage,
        mongo,
        db,
        repo,
        providerFiles,
        sitemapStore,
        users,
        identityProviders,
        credentials,
        pats,
        authTokens,
        rateLimit,
        secrets,
        cache: new InMemoryCache(),
        close: () => mongo.close(),
    };
}

export type CoreStores = Awaited<ReturnType<typeof createCoreStores>>;
