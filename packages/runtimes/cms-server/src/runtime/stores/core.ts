import {
    MongoAuthTokenStore,
    MongoIdentityProviderRepository,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoUsersRepository,
} from "@bernouy/cms-auth/mongo";
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { ValidatingCmsFilesMetadata } from "@bernouy/cms-content/files";
import { createLocalAuthorFileStores } from "./authorFiles";
import { MongoCmsFilesMetadata } from "@bernouy/cms-content/files/mongo";
import { EnvelopeSecretCrypto, LocalKekProvider } from "@bernouy/envelope-crypto";
import { createFieldCrypto, MongoDekRepository } from "@bernouy/envelope-crypto/mongo";
import { InMemoryCache } from "@bernouy/http-runner";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import { ValidatingSecretStore } from "@bernouy/cms-secrets";
import { EncryptedMongoSecretStore } from "@bernouy/cms-secrets/mongo";
import { MongoClient } from "mongodb";
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
    const { filesBlob, variantStore, sitemapStore } = createLocalAuthorFileStores(env.CMS_FILES_DIR);

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
        mongo,
        db,
        repo,
        filesMetadata,
        filesBlob,
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
