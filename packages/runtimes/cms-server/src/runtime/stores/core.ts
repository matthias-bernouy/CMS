import { type CMS_ROLES, ValidatingRolesRepository } from "@bernouy/cms-permissions";
import { MongoRolesRepository } from "@bernouy/cms-permissions/mongo";
import {
    MongoAuthTokenStore,
    MongoIdentityProviderRepository,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoUsersRepository,
} from "@bernouy/cms-auth/mongo";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { LocalFsCmsFilesBlob, ValidatingCmsFilesMetadata } from "@bernouy/cms-files";
import { MongoCmsFilesMetadata } from "@bernouy/cms-files/mongo";
import { LocalSourceImageCache } from "@bernouy/cms-source-images/local-fs";
import { MongoSourceImageJobQueue, MongoSourceMediaIndex } from "@bernouy/cms-source-images/mongo";
import { EnvelopeSecretCrypto, LocalKekProvider } from "@bernouy/envelope-crypto";
import { createFieldCrypto, MongoDekRepository } from "@bernouy/envelope-crypto/mongo";
import { InMemoryCache } from "@bernouy/http-runner";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import { ValidatingSecretStore } from "@bernouy/cms-secrets";
import { EncryptedMongoSecretStore } from "@bernouy/cms-secrets/mongo";
import { type Db, MongoClient } from "mongodb";
import { join } from "node:path";
import { migrateLegacyOperatorRoles } from "../../migrateLegacyOperatorRoles";
import type { RuntimeEnv } from "../../runtimeEnv";

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
    const repo = new ValidatingCmsRepository(innerRepo);

    const mongoFilesMetadata = new MongoCmsFilesMetadata(db);
    await mongoFilesMetadata.init();
    const filesMetadata = new ValidatingCmsFilesMetadata(mongoFilesMetadata);
    const filesBlob = new LocalFsCmsFilesBlob(env.CMS_FILES_DIR);
    const variantStore = new LocalFsCmsFilesBlob(`${env.CMS_FILES_DIR}/.variants`);
    const sitemapStore = new LocalFsCmsFilesBlob(`${env.CMS_FILES_DIR}/.sitemaps`);
    const sourceImageCache = await createRuntimeSourceImageCache(env);
    const sourceImageJobs = new MongoSourceImageJobQueue(db);
    const sourceMediaIndex = new MongoSourceMediaIndex(db);
    await Promise.all([sourceImageJobs.init(), sourceMediaIndex.init()]);

    const users = new MongoUsersRepository<CMS_ROLES>(db, fieldCrypto);
    const identityProviders = new MongoIdentityProviderRepository(db);
    const credentials = new MongoLocalCredentialStore(db, fieldCrypto);
    await credentials.init();
    const pats = new MongoPatRepository(db);
    await pats.init();
    const authTokens = new MongoAuthTokenStore(db);
    await authTokens.init();

    const rateLimit = new MongoRateLimiter(db, { limit: 8, windowSeconds: 300 });
    await rateLimit.init();
    const repositoryPackageDownloadRateLimit =
        env.CMS_REPOSITORY_HUB_FACADE_ENABLED && env.CMS_HTTP_CLIENT_ADDRESS_MODE !== "disabled"
            ? await createRepositoryPackageDownloadRateLimiter(db, env)
            : undefined;
    const mongoRoles = new MongoRolesRepository(db.collection("cms_roles"));
    await mongoRoles.init();
    const migration = await migrateLegacyOperatorRoles(users, mongoRoles);
    if (migration.promotedUsers || migration.removedRoleDefinitions.length) {
        console.log(
            `Migrated ${migration.promotedUsers} legacy operators to admin; removed roles: ${migration.removedRoleDefinitions.join(", ") || "none"}`,
        );
    }
    const roles = new ValidatingRolesRepository(mongoRoles);
    const secrets = new ValidatingSecretStore(
        new EncryptedMongoSecretStore({
            scopeId: SCOPE_ID,
            collection: db.collection("cms_secrets"),
            secretCrypto,
        }),
    );

    return {
        mongo,
        db,
        repo,
        filesMetadata,
        filesBlob,
        variantStore,
        sitemapStore,
        sourceImageCache,
        sourceImageJobs,
        sourceMediaIndex,
        users,
        identityProviders,
        credentials,
        pats,
        authTokens,
        rateLimit,
        repositoryPackageDownloadRateLimit,
        roles,
        secrets,
        cache: new InMemoryCache(),
    };
}

export async function createRepositoryPackageDownloadRateLimiter(
    db: Db,
    env: Pick<RuntimeEnv, "CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT" | "CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS">,
): Promise<MongoRateLimiter> {
    const limiter = new MongoRateLimiter(
        db,
        {
            limit: env.CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT,
            windowSeconds: env.CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS,
        },
        { collectionPrefix: "repository_package_download_" },
    );
    await limiter.init();
    return limiter;
}

export async function createRuntimeSourceImageCache(
    env: Pick<RuntimeEnv, "CMS_FILES_DIR" | "CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED">,
): Promise<LocalSourceImageCache | null> {
    if (!env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED) {
        return null;
    }
    const cache = new LocalSourceImageCache({
        directory: join(env.CMS_FILES_DIR, ".source-images"),
        retention: "persistent",
    });
    await cache.initialize();
    return cache;
}

export type CoreStores = Awaited<ReturnType<typeof createCoreStores>>;
