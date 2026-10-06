import { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/cms-repository/collections/mongo";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import {
    PageRouteMutationCoordinator,
    synchronizePageRoutes,
    validatePageLinks,
    withCollectionPageRoutes,
    withInstalledCollections,
    withSitePageRoutes,
} from "@bernouy/cms-content";
import { CollectionMigrationService, withCollectionMigrationWriteFence } from "@bernouy/cms-content/migrations";
import {
    MongoAuthTokenStore,
    MongoIdentityProviderRepository,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoUsersRepository,
} from "@bernouy/cms-auth/mongo";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import {
    MongoCmsRepository,
    MongoCollectionMigrationStorage,
    MongoSurfacePageRouteRegistry,
} from "@bernouy/cms-content/mongo";
import { recoverFileMutations, ValidatingCmsFilesMetadata } from "@bernouy/cms-content/files";
import { createLocalAuthorFileStores } from "./authorFiles";
import { MongoCmsFileMutationJournal, MongoCmsFilesMetadata } from "@bernouy/cms-content/files/mongo";
import { EnvelopeSecretCrypto, LocalKekProvider } from "@bernouy/envelope-crypto";
import { createFieldCrypto, MongoDekRepository } from "@bernouy/envelope-crypto/mongo";
import { InMemoryCache } from "@bernouy/http-runner";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import { MongoClient } from "mongodb";
import type { RuntimeEnv } from "../../runtimeEnv";
import { CMS_REPOSITORY_FENCED_MUTATIONS, COLLECTION_STORE_FENCED_MUTATIONS } from "./migrationWritePolicy";

const SCOPE_ID = "default";

export async function createCoreStores(env: RuntimeEnv) {
    const mongo = new MongoClient(env.MONGO_URL);
    await mongo.connect();
    const db = mongo.db();

    const kekProvider = new LocalKekProvider(Buffer.from(env.CMS_KEK_HEX, "hex"));
    const dekRepository = new MongoDekRepository(db.collection("cms_deks"));
    const secretCrypto = new EnvelopeSecretCrypto(kekProvider, dekRepository);
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
    const mongoFilesMetadata = new MongoCmsFilesMetadata(db);
    await mongoFilesMetadata.init();
    const filesMetadata = new ValidatingCmsFilesMetadata(mongoFilesMetadata);
    const { filesBlob, variantStore, sitemapStore } = createLocalAuthorFileStores(env.CMS_FILES_DIR);
    const fileMutations = new MongoCmsFileMutationJournal(db);
    await fileMutations.init();
    await recoverFileMutations(filesMetadata, filesBlob, fileMutations);

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
        migrationStorage,
        mongo,
        db,
        repo,
        filesMetadata,
        filesBlob,
        fileMutations,
        variantStore,
        sitemapStore,
        users,
        identityProviders,
        credentials,
        pats,
        authTokens,
        rateLimit,
        secrets,
        cache: new InMemoryCache(),
    };
}

export type CoreStores = Awaited<ReturnType<typeof createCoreStores>>;
