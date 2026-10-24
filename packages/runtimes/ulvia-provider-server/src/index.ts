import { MongoClient } from "mongodb";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import {
    OfficialInstanceProfiles,
    OfficialInstanceProvisioner,
    ProviderInstanceLifecycle,
} from "@bernouy/ulvia-provider";
import { EncryptedInstanceCredentials } from "./runtime/authentication/EncryptedInstanceCredentials";
import { MongoInstanceCredentialStore } from "./runtime/authentication/MongoInstanceCredentialStore";
import { ProviderInstanceAuthenticator } from "./runtime/authentication/ProviderInstanceAuthenticator";
import { createEnvelopeSecretCrypto } from "./runtime/stores/envelopeCrypto";
import { ProviderInstanceHost } from "./runtime/instances/ProviderInstanceHost";
import { RecoverySupervisor } from "./runtime/recovery/RecoverySupervisor";
import { MongoProviderInstanceRegistry } from "./runtime/instances/MongoProviderInstanceRegistry";
import { MongoInstanceTransitionStore } from "./runtime/instances/MongoInstanceTransitionStore";
import { loadOfficialArtifacts } from "./runtime/instances/officialArtifacts";
import { mountUlviaProvider } from "./runtime/gateway/mountUlviaProvider";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readProviderRuntimeEnv } from "./runtimeEnv";
import { createProviderLogger } from "./runtime/logger";
import { correlatedRepositoryFetch } from "./runtime/gateway/repositoryFetch";

const logger = createProviderLogger(process.env);
try {
    const env = readProviderRuntimeEnv(process.env);
    await validateCmsStorageRoots(env.CMS_FILES_DIR);

    const mongo = new MongoClient(env.MONGO_URL);
    await mongo.connect();
    const controlDb = mongo.db();
    const secretCrypto = await createEnvelopeSecretCrypto(controlDb, env.CMS_KEK);
    const secrets = new ValidatingSecretStore(
        new EncryptedMongoSecretStore({
            scopeId: "ulvia-provider-control",
            collection: controlDb.collection("ulvia_provider_secrets"),
            secretCrypto,
        }),
    );
    const instances = new MongoProviderInstanceRegistry(controlDb);
    const credentialStore = new MongoInstanceCredentialStore(controlDb);
    const transitions = new MongoInstanceTransitionStore(controlDb);
    await Promise.all([instances.init(), credentialStore.init(), transitions.init()]);
    const credentials = new EncryptedInstanceCredentials(credentialStore, secrets);

    let provider;
    let host: ProviderInstanceHost | undefined;
    let transitionRecovery: RecoverySupervisor | undefined;
    let operationRecovery: Promise<void> | undefined;
    try {
        const providerSource = new HttpProviderRepository("ulvia-provider-runtime", env.CMS_REPOSITORY_URL, {
            request: correlatedRepositoryFetch,
            allowInsecureHttp: env.CMS_REPOSITORY_ALLOW_INSECURE_HTTP,
        });
        const collectionSource = new HttpCollectionRepository("ulvia-provider-runtime", env.CMS_REPOSITORY_URL, {
            request: correlatedRepositoryFetch,
            allowInsecureHttp: env.CMS_REPOSITORY_ALLOW_INSECURE_HTTP,
        });
        const artifacts = await loadOfficialArtifacts(providerSource, collectionSource);
        const profiles = new OfficialInstanceProfiles(artifacts.profiles, artifacts.defaultProfile);
        const instanceHost = new ProviderInstanceHost(env, credentials, profiles, logger);
        host = instanceHost;
        const provisioner = new OfficialInstanceProvisioner(
            instances,
            transitions,
            (instance) => instanceHost.target(instance),
            {
                read: (instanceId) => credentials.readAdministrator(instanceId),
                clear: (instanceId) => credentials.clearAdministrator(instanceId),
            },
            profiles,
        );
        const lifecycle = new ProviderInstanceLifecycle(
            instances,
            credentials,
            provisioner,
            profiles,
            env.CMS_SESSION_SECRET,
        );
        const authenticator = new ProviderInstanceAuthenticator(instances, credentialStore, credentials);
        provider = mountUlviaProvider({
            env,
            contracts: artifacts.contracts,
            authenticator,
            host: instanceHost,
            lifecycle,
            logger,
        });
        transitionRecovery = new RecoverySupervisor(
            (limit) => provisioner.recover(limit),
            undefined,
            undefined,
            (error) => logger.error("provider.transition.recovery.failed", {}, error),
        );
        await transitionRecovery.start(false);
        operationRecovery = instances
            .list()
            .then((records) => instanceHost.recoverOperations(records))
            .then(() => undefined)
            .catch((error) => logger.error("provider.operation.startup-recovery.failed", {}, error));
    } catch (error) {
        await settleCleanup("startup", [
            ["transition-recovery", transitionRecovery?.stop()],
            ["operation-recovery", operationRecovery],
            ["listener", provider?.stop()],
            ["instances", host?.close()],
            ["database", mongo.close()],
        ]);
        throw error;
    }

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info("provider.stopping", { signal });
        const failures = [
            ...(await settleCleanup("shutdown-listener", [["listener", provider.stop()]])),
            ...(await settleCleanup("shutdown-background", [
                ["transition-recovery", transitionRecovery?.stop()],
                ["operation-recovery", operationRecovery],
            ])),
            ...(await settleCleanup("shutdown-resources", [
                ["instances", host?.close()],
                ["database", mongo.close()],
            ])),
        ];
        if (failures.length > 0) {
            throw new AggregateError(failures, "Provider shutdown failed");
        }
    };
    const handleSignal = (signal: string): void => {
        void shutdown(signal).catch((error) => {
            logger.fatal("provider.shutdown.failed", {}, error);
            process.exitCode = 1;
        });
    };
    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));
} catch (error) {
    logger.fatal("provider.startup.failed", {}, error);
    throw error;
}

async function settleCleanup(
    phase: string,
    tasks: ReadonlyArray<readonly [component: string, task: Promise<unknown> | undefined]>,
): Promise<unknown[]> {
    const results = await Promise.allSettled(tasks.map(([, task]) => task));
    const failures: unknown[] = [];
    for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
            failures.push(result.reason);
            logger.error("provider.cleanup.failed", { phase, component: tasks[index]![0] }, result.reason);
        }
    }
    return failures;
}
