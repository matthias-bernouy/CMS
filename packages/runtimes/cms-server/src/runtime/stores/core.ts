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
import { EnvelopeSecretCrypto, LocalKekProvider } from "@bernouy/envelope-crypto";
import { createFieldCrypto, MongoDekRepository } from "@bernouy/envelope-crypto/mongo";
import { InMemoryCache } from "@bernouy/http-runner";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import { ValidatingSecretStore } from "@bernouy/cms-secrets";
import { EncryptedMongoSecretStore } from "@bernouy/cms-secrets/mongo";
import { MongoClient } from "mongodb";
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
    const sourceImageCache = await createRuntimeSourceImageCache(env);

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
        sourceImageCache,
        users,
        identityProviders,
        credentials,
        pats,
        authTokens,
        rateLimit,
        roles,
        secrets,
        cache: new InMemoryCache(),
    };
}

export async function createRuntimeSourceImageCache(
    env: Pick<RuntimeEnv, "CMS_FILES_DIR" | "CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED">,
): Promise<LocalSourceImageCache | null> {
    if (!env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED) {
        return null;
    }
    const cache = new LocalSourceImageCache({
        directory: join(env.CMS_FILES_DIR, ".source-images"),
    });
    await cache.initialize();
    return cache;
}

export type CoreStores = Awaited<ReturnType<typeof createCoreStores>>;
