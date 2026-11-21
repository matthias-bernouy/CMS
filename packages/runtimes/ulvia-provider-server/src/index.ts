import { createRoutingRuntime } from "./runtime/instances/system/hosting/routingRuntime";
import { ClusterLogs } from "@bernouy/observability/cluster";
import { createClusterLogsRuntime } from "./runtime/gateway/operator/runtime";
import { clusterJournalDirectory } from "./runtime/gateway/operator/journals";
import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";
import { MongoProviderOperationStore } from "./runtime/provider-operations/MongoProviderOperationStore";
import { createTlsRuntime } from "./runtime/instances/system/hosting/tlsRuntime";
import { readHostingConfiguration } from "./runtime/instances/system/hosting/configuration";
import { composeHosting } from "./runtime/instances/system/hosting/compose";
import { authorizeHostedCreation } from "./runtime/instances/system/hosting/creationAuthority";
import { SystemBootstrap } from "./runtime/instances/system/execution/SystemBootstrap";
import { ProviderExecutionSupport } from "./runtime/instances/system/execution/support";
import { assertHostedReleaseRetention, managedReleaseReader } from "./runtime/instances/system/retention";
import { MongoAdministratorGrantStore } from "@bernouy/cms-gateway/access/mongo";
import { instanceDatabaseName } from "./runtime/stores/storageRoots";
import { MongoClient } from "mongodb";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import { OfficialInstanceProvisioner, ProviderInstanceLifecycle } from "@bernouy/ulvia-provider";
import { EncryptedInstanceCredentials } from "./runtime/authentication/EncryptedInstanceCredentials";
import { MongoInstanceCredentialStore } from "./runtime/authentication/MongoInstanceCredentialStore";
import { MongoInstanceAuthenticationReader } from "./runtime/authentication/material/MongoInstanceAuthenticationReader";
import { ProviderInstanceAuthenticator } from "./runtime/authentication/ProviderInstanceAuthenticator";
import { createEnvelopeSecretCrypto } from "./runtime/stores/envelopeCrypto";
import { ProviderInstanceHost } from "./runtime/instances/composition/ProviderInstanceHost";
import { RecoverySupervisor } from "./runtime/recovery/RecoverySupervisor";
import { MongoProviderInstanceRegistry } from "./runtime/instances/MongoProviderInstanceRegistry";
import { MongoInstanceTransitionStore } from "./runtime/instances/MongoInstanceTransitionStore";
import { bundledBootstrapSources } from "./runtime/instances/system/bootstrap";
import { mountUlviaProvider } from "./runtime/gateway/mountUlviaProvider";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readProviderRuntimeEnv } from "./runtimeEnv";
import { createProviderLogger } from "./runtime/logger";

const logger = createProviderLogger(process.env);
try {
    if (!process.execArgv.includes("--no-macros")) {
        throw new Error(
            "Start the Provider with bun --no-macros; remote collection compilation must not execute build-time macros",
        );
    }
    const env = readProviderRuntimeEnv(process.env);
    const hostingConfiguration = readHostingConfiguration(process.env);
    await validateCmsStorageRoots(env.CMS_FILES_DIR);

    const mongo = new MongoClient(env.MONGO_URL, { monitorCommands: true });
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
    let tlsDelivery: { start(): void; stop(): Promise<void> } | undefined;
    try {
        const bootstrap = bundledBootstrapSources(env.ULVIA_BOOTSTRAP_DIR);
        const system = new SystemBootstrap(bootstrap);
        const support = new ProviderExecutionSupport();
        await assertHostedReleaseRetention(
            support,
            {
                instances: instances.scan(),
                transitions: (id) => transitions.scanRetained(id),
                hasUnstagedUpgrade: (id) => transitions.hasUnstagedUpgrade(id),
            },
            managedReleaseReader(mongo, support, env.ULVIA_PROVIDER_PUBLIC_URL),
            system,
        );
        const instanceHost = new ProviderInstanceHost(env, credentials, system, logger, support, instances, bootstrap);
        host = instanceHost;
        const provisioner = new OfficialInstanceProvisioner(
            instances,
            transitions,
            (instance, transition, execution) => instanceHost.target(instance, transition, execution),
            {
                read: (instanceId) => credentials.readAdministrator(instanceId),
                clear: (instanceId) => credentials.clearAdministrator(instanceId),
                authorizeCreation: (actor) => authorizeHostedCreation(instanceHost, actor),
                authorizeExtension: async (instance, sub) =>
                    (
                        await new MongoAdministratorGrantStore(mongo.db(instanceDatabaseName(instance.storageKey))).get(
                            sub,
                        )
                    ).enabled,
            },
        );
        instanceHost.repositoryCreation = {
            create: async (instance, expectedRevision, administratorId) => {
                const { source, target } = await instanceHost.registryPlan(instance);
                return provisioner.createRepository(instance.id, source, target, expectedRevision, administratorId);
            },
            read: (instance) => provisioner.repositoryCreation(instance),
        };
        const lifecycle = new ProviderInstanceLifecycle(
            instances,
            credentials,
            provisioner,
            system,
            env.CMS_SESSION_SECRET,
            {
                review: (instance, input) => instanceHost.reviewSystemUpgrade(instance, input),
                apply: async (instance, input) => {
                    const review = await instanceHost.reviewSystemUpgrade(instance, input);
                    if (review.planDigest !== input.planDigest) {
                        throw new TypeError("System upgrade review changed");
                    }
                    return provisioner.upgradeSystem(
                        instance.id,
                        review.source,
                        review.target,
                        input.expectedRevision,
                        input.administratorSub,
                    );
                },
                resume: (instance, administratorSub) => provisioner.resumeSystemUpgrade(instance.id, administratorSub),
            },
        );
        const hosting = await composeHosting({
            resourceRevision: (storageKey) =>
                new MongoSiteUpgradeStorage(mongo.db(instanceDatabaseName(storageKey))).readResourceRevision("default"),
            db: controlDb,
            host: instanceHost,
            instances,
            credentials,
            provisioner,
            system,
            lifecycle,
            idempotencySecret: env.CMS_SESSION_SECRET,
            configuration: hostingConfiguration,
            logger,
        });
        tlsDelivery = hosting.delivery;
        instanceHost.hosting = hosting.services;
        const control = await hosting.initialize();
        logger.info("provider.control.initialized", {
            instanceId: control.instance.id,
            origin: control.domain.origin,
            instanceStatus: control.instance.status,
            domainStatus: control.domain.state,
            tlsStatus: control.domain.tls,
        });
        const authenticator = new ProviderInstanceAuthenticator(
            new MongoInstanceAuthenticationReader(controlDb, "ulvia-provider-control", secretCrypto),
        );
        const routing = await createRoutingRuntime(system, hosting.routing, hostingConfiguration.edgeSecret);
        const tls = await createTlsRuntime(system, hosting.delivery.authority);
        const clusterLogs = await createClusterLogsRuntime(
            system,
            new ClusterLogs({
                directory: clusterJournalDirectory(mongo, instances),
                cursorKey: env.CMS_SESSION_SECRET,
                scopeId: env.ULVIA_PROVIDER_PUBLIC_URL,
            }),
        );
        provider = mountUlviaProvider({
            env,
            authenticator,
            host: instanceHost,
            lifecycle,
            logger,
            tls,
            clusterLogs,
            readiness: async () => (await hosting.store.readInstallation())?.phase === "ready",
            routing: { authority: hosting.routing, instances, authenticate: routing.authenticate },
        });
        tlsDelivery.start();
        instanceHost.startDocumentation();
        transitionRecovery = new RecoverySupervisor(
            (limit) => provisioner.recover(limit),
            undefined,
            undefined,
            (error) => logger.error("provider.transition.recovery.failed", {}, error),
        );
        await transitionRecovery.start(false);
        operationRecovery = instanceHost
            .recoverOperations(instances.scan(), async (instance) =>
                new MongoProviderOperationStore(mongo.db(instanceDatabaseName(instance.storageKey))).hasPending(),
            )
            .then(() => undefined)
            .catch((error) => logger.error("provider.operation.startup-recovery.failed", {}, error));
    } catch (error) {
        await settleCleanup("startup", [
            ["tls-delivery", tlsDelivery?.stop()],
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
            ...(await settleCleanup("shutdown-tls", [["tls-delivery", tlsDelivery?.stop()]])),
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
