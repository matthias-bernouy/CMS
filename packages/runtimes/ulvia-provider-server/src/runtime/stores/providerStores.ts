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
    MongoIdentityProviderRepository,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoUsersRepository,
} from "@bernouy/cms-auth/mongo";
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

const SCOPE_ID = "default";

export type ProviderStoreConfig = Readonly<{
    MONGO_URL: string;
    CMS_KEK: RuntimeKekConfig;
    CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: number;
    CMS_FILES_DIR: string;
    CMS_SESSION_SECRET: string;
    KERNEL_PUBLIC_URL: string;
}>;

export async function createProviderStores(env: ProviderStoreConfig) {
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
    });
    const validatedRepo = new ValidatingCmsRepository(
        withInstalledCollections(innerRepo, migrationCollections, SCOPE_ID, pageRoutes),
    );
    await validatePageLinks(validatedRepo, pageRoutes, SCOPE_ID);
    const migrationRepo = withSitePageRoutes(validatedRepo, pageRoutes, SCOPE_ID, pageRouteMutations);
    const migrationStorage = new MongoCollectionMigrationStorage(db);
    await migrationStorage.init();
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
    const providerFiles = new CmsFilesService({
        store: providerFilesStore,
        blobs: providerBlobs,
        signingKey,
        publicBaseUrl: env.KERNEL_PUBLIC_URL,
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
        collections,
        pageRoutes,
        collectionMigrations,
        migrationStorage,
        mongo,
        db,
        repo,
        providerFiles,
        users,
        identityProviders,
        credentials,
        pats,
        secrets,
        identities,
        close: () => mongo.close(),
    };
}

export type ProviderStores = Awaited<ReturnType<typeof createProviderStores>>;
