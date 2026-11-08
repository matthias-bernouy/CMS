import { createResourceStores } from "./resources/stores";
import { resourceInitializationFactory } from "./resources/initialization";
import { initializationExecution } from "./selections/initializationExecution";
import { MongoInitializationStateStore } from "@bernouy/repository/collections/mongo";
import { initializationFactory } from "./collections/initialization";
import type { CollectionVerifier } from "@bernouy/repository/collections/sources";
import { observeSelectionCommits } from "./selections/notifications";
import { createCollectionUpgradeAnalysis } from "./collections/upgradeAnalysis";
import { CollectionStore } from "@bernouy/repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/repository/collections/mongo";
import { MongoReleaseCatalogue } from "@bernouy/repository/contracts/mongo";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
import { CollectionUpgradeService } from "@bernouy/repository/collections/installations";
import {
    MongoOAuthStore,
    MongoSessionRepository,
    MongoAuthTokenStore,
    MongoLocalCredentialStore,
    MongoPatRepository,
    MongoUsersRepository,
} from "@bernouy/auth/mongo";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import { ValidatingContentRepository } from "@bernouy/content";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";
import { withSiteWriteFence } from "@bernouy/repository/upgrades";
import { createFieldCrypto } from "@bernouy/envelope-crypto/mongo";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import { MongoClient } from "mongodb";
import { CmsObservability } from "@bernouy/observability";
import { MongoJournalStore } from "@bernouy/observability/mongo";
import type { RuntimeKekConfig } from "../../runtimeEnvKek";
import { CMS_REPOSITORY_FENCED_MUTATIONS, COLLECTION_STORE_FENCED_MUTATIONS } from "./collections/siteWritePolicy";
import { createEnvelopeSecretCrypto } from "./secrets/envelopeCrypto";
import { CmsFilesService, CmsImageDerivatives } from "@bernouy/files";
import { MongoCmsFilesStore } from "@bernouy/files/mongo";
import { LocalFsBlobStore } from "@bernouy/blob-store/local-fs";
import { join } from "node:path";
import { SharpImageTransformer } from "@bernouy/image-processing/sharp";
import { MongoIdentityService } from "@bernouy/cms-gateway/identity/mongo";
import {
    MongoProviderExecutionStateReader,
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/repository/providers/selections";
import type { StoredContractSelections } from "@bernouy/ulvia-providers/selections";
import { selectedCapabilityResolver, selectedPublicSvgCapabilityValidator } from "./selections/capabilities";
import type { Logger } from "@bernouy/logging";
import { CmsSecrets } from "@bernouy/secrets";
import { MongoCmsSecretMetadataStore } from "@bernouy/secrets/mongo";
import { EncryptedProviderConnections } from "../gateway/providers/connections/EncryptedProviderConnections";
import { EncryptedConnectionDrafts } from "../gateway/providers/connections/EncryptedConnectionDrafts";
import { MongoCmsSecretResolutionReader } from "./secrets/MongoCmsSecretResolutionReader";
import { createContractSecretStores } from "./secrets/contractSecretStores";
import { ConfiguredSmtpEmailer } from "@bernouy/email-smtp/nodemailer";

const SCOPE_ID = "default";

export type ProviderStoreConfig = Readonly<{
    instanceId: string;
    MONGO_URL: string;
    CMS_KEK: RuntimeKekConfig;
    CMS_FILES_DIR: string;
    CMS_SESSION_SECRET: string;
    CMS_PUBLIC_URL: string;
}>;

export async function createProviderStores(
    env: ProviderStoreConfig,
    logger: Logger,
    onSelectionsCommitted?: (state: StoredContractSelections) => void,
    collectionVerifier?: CollectionVerifier,
) {
    const mongo = new MongoClient(env.MONGO_URL);
    await mongo.connect();
    const db = mongo.db();
    const journal = new MongoJournalStore(db);
    await journal.init();
    const observability = new CmsObservability({
        store: journal,
        instanceId: env.instanceId,
        cursorKey: env.CMS_SESSION_SECRET,
    });
    const releases = new MongoReleaseCatalogue(db);
    const manifests = new MongoProviderManifestCatalogue(db, releases);
    const upgradeStorage = new MongoSiteUpgradeStorage(db);
    await upgradeStorage.init();
    const rawInstallations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    await rawInstallations.init();
    const installations = withSiteWriteFence(rawInstallations, upgradeStorage, SCOPE_ID, [
        "approve",
        "reapprove",
        "setStatus",
    ]);
    const selectionDependencies = new CatalogueSelectionDependencies(releases, manifests, installations);
    const rawSelectionStore = new MongoContractSelectionStore(db, selectionDependencies);
    const selectionStore = observeSelectionCommits(rawSelectionStore, logger, onSelectionsCommitted);
    const selections = withSiteWriteFence(selectionStore, upgradeStorage, SCOPE_ID, ["replace"]);
    const executionState = new MongoProviderExecutionStateReader(db, selections, installations);
    await executionState.init().catch(async (error) => {
        await mongo.close();
        throw error;
    });

    const secretCrypto = await createEnvelopeSecretCrypto(db, env.CMS_KEK).catch(async (error) => {
        await mongo.close();
        throw error;
    });
    const connectionDrafts = new EncryptedConnectionDrafts(db, secretCrypto, `provider-connections:${env.instanceId}`);
    await connectionDrafts.init();
    const fieldCrypto = await createFieldCrypto(SCOPE_ID, secretCrypto, db);

    const innerRepo = new MongoContentRepository(db);
    await innerRepo.init();
    const resourceStores = await createResourceStores(db, env.CMS_FILES_DIR, env.instanceId, SCOPE_ID, innerRepo);
    const collectionStorage = new MongoCollectionStorage(db, undefined, collectionVerifier);
    await collectionStorage.init();
    const rawCollections = new CollectionStore(collectionStorage, releases);
    const upgradeCollections = rawCollections;
    const validatedRepo = new ValidatingContentRepository(
        withInstalledCollections(resourceStores.content, upgradeCollections, SCOPE_ID),
        {
            resolveCapabilities: selectedCapabilityResolver(SCOPE_ID, selections, releases),
            requireQueryCapabilityResolution: true,
            validateSvgCapabilities: selectedPublicSvgCapabilityValidator(SCOPE_ID, selections, releases),
            requireSvgCapabilityResolution: true,
        },
    );
    const upgradeRepo = validatedRepo;
    const collectionUpgrades = new CollectionUpgradeService(upgradeRepo, upgradeCollections, upgradeStorage, {
        ...createCollectionUpgradeAnalysis(SCOPE_ID, selections, releases, selectionDependencies),
        ...(collectionVerifier ? { verifyEvolution: collectionVerifier.evolution } : {}),
    });
    const repo = withSiteWriteFence(upgradeRepo, upgradeStorage, SCOPE_ID, CMS_REPOSITORY_FENCED_MUTATIONS);
    const initializationState = new MongoInitializationStateStore(db);
    const createInitialization = initializationFactory(
        env.instanceId,
        initializationState,
        upgradeRepo,
        upgradeCollections,
        upgradeStorage,
        selections,
        executionState,
        releases,
        collectionVerifier,
    );
    const createResourceInitialization = resourceInitializationFactory(
        env.instanceId,
        SCOPE_ID,
        join(env.CMS_FILES_DIR, "resource-initialization"),
        resourceStores,
        upgradeRepo,
        innerRepo,
        upgradeStorage,
        initializationExecution(SCOPE_ID, selections, executionState, releases),
    );
    const collections = withSiteWriteFence(
        upgradeCollections,
        upgradeStorage,
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
        publicBaseUrl: env.CMS_PUBLIC_URL,
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
    const oauthPublicLimiter = new MongoRateLimiter(
        db,
        { limit: 32, windowSeconds: 60 },
        { collectionPrefix: "cms_oauth_public_" },
    );
    await oauthPublicLimiter.init();
    const oauthStore = new MongoOAuthStore(db);
    await oauthStore.init();
    const sessions = new MongoSessionRepository(db);
    await sessions.init();
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
    const secretMetadata = new MongoCmsSecretMetadataStore({
        secrets: db.collection("cms_secret_metadata"),
        namespaces: db.collection("cms_secret_namespaces"),
        namespaceKeys: db.collection("cms_secret_namespace_keys"),
    });
    await secretMetadata.init();
    const cmsSecrets = new CmsSecrets(secretMetadata, secrets, {
        resolutionReader: new MongoCmsSecretResolutionReader(db, SCOPE_ID, secretCrypto),
    });
    const contractSecrets = await createContractSecretStores(cmsSecrets, secrets);
    const emailer = new ConfiguredSmtpEmailer({ secrets: contractSecrets.smtpEmailer });
    const identities = new MongoIdentityService(db);
    await identities.init();

    return {
        logger,
        observability,
        connectionDrafts,
        providerConnections: new EncryptedProviderConnections(
            db,
            secretCrypto,
            `provider-return-connections:${env.instanceId}`,
        ),
        runtimeSessionSecret: env.CMS_SESSION_SECRET,
        collections,
        collectionUpgrades,
        initializationState,
        createInitialization,
        resourceStores,
        createResourceInitialization,
        upgradeStorage,
        mongo,
        db,
        repo,
        providerFiles,
        users,
        credentials,
        pats,
        sessions,
        authTokens,
        oauthStore,
        oauthPublicLimiter,
        rateLimit,
        cmsSecrets,
        contractSecrets,
        emailer,
        identities,
        releases,
        manifests,
        installations,
        selections,
        executionState,
        selectionChanges: { store: selectionStore, dependencies: selectionDependencies },
        sitemapStore: new LocalFsBlobStore(join(env.CMS_FILES_DIR, "sitemaps")),
        close: () => mongo.close(),
    };
}

export type ProviderStores = Awaited<ReturnType<typeof createProviderStores>>;
