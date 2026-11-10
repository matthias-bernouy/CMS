import { createRoutingRuntime } from "../../src/runtime/instances/system/hosting/routingRuntime";
import { createTlsRuntime } from "../../src/runtime/instances/system/hosting/tlsRuntime";
import { mountUlviaProvider } from "../../src/runtime/gateway/mountUlviaProvider";
import { ProviderInstanceAuthenticator } from "../../src/runtime/authentication/ProviderInstanceAuthenticator";
import { MongoInstanceAuthenticationReader } from "../../src/runtime/authentication/material/MongoInstanceAuthenticationReader";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import { OfficialInstanceProvisioner, ProviderInstanceLifecycle } from "@bernouy/hosting/instances";
import { NOOP_LOGGER } from "@bernouy/logging";
import { readProviderRuntimeEnv } from "../../src/runtimeEnv";
import { createEnvelopeSecretCrypto } from "../../src/runtime/stores/envelopeCrypto";
import { instanceDatabaseName } from "../../src/runtime/stores/storageRoots";
import { EncryptedInstanceCredentials } from "../../src/runtime/authentication/EncryptedInstanceCredentials";
import { MongoInstanceCredentialStore } from "../../src/runtime/authentication/MongoInstanceCredentialStore";
import { MongoProviderInstanceRegistry } from "../../src/runtime/instances/MongoProviderInstanceRegistry";
import { MongoInstanceTransitionStore } from "../../src/runtime/instances/MongoInstanceTransitionStore";
import { ProviderInstanceHost } from "../../src/runtime/instances/composition/ProviderInstanceHost";
import { bundledBootstrapSources } from "../../src/runtime/instances/system/bootstrap";
import { SystemBootstrap } from "../../src/runtime/instances/system/execution/SystemBootstrap";
import { ProviderExecutionSupport } from "../../src/runtime/instances/system/execution/support";
import { composeHosting } from "../../src/runtime/instances/system/hosting/compose";
import { authorizeHostedCreation } from "../../src/runtime/instances/system/hosting/creationAuthority";
import { readHostingConfiguration } from "../../src/runtime/instances/system/hosting/configuration";
import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";

export async function hostingRuntimeFixture(mongoUrl: string) {
    const root = await mkdtemp(join(tmpdir(), "ulvia-hosting-runtime-"));
    const url = new URL(mongoUrl);
    url.pathname = `/ulvia_hosting_runtime_${crypto.randomUUID().replaceAll("-", "")}`;
    const client = new MongoClient(url.href);
    await client.connect();
    const db = client.db();
    const bootstrapFile = join(root, "operator.json");
    const modelDirectory = join(root, "empty-model");
    await mkdir(modelDirectory);
    await writeFile(
        bootstrapFile,
        JSON.stringify({ email: "operator@example.test", password: "protected-operator-password" }),
        { mode: 0o600 },
    );
    const env = readProviderRuntimeEnv({
        ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5103",
        ULVIA_PROVIDER_HOST: "127.0.0.1",
        ULVIA_PROVIDER_OPERATOR_TOKEN: randomBytes(32).toString("base64url"),
        MONGO_URL: url.href,
        CMS_FILES_DIR: root,
        CMS_SESSION_SECRET: randomBytes(32).toString("base64url"),
        CMS_KEK_ACTIVE_ID: "test",
        CMS_KEK_RING_JSON: JSON.stringify({ test: randomBytes(32).toString("hex") }),
        ULVIA_EMBEDDING_MODEL_DIR: modelDirectory,
    });
    const secretCrypto = await createEnvelopeSecretCrypto(db, env.CMS_KEK);
    const secrets = new ValidatingSecretStore(
        new EncryptedMongoSecretStore({
            scopeId: "ulvia-provider-control",
            collection: db.collection("ulvia_provider_secrets"),
            secretCrypto,
        }),
    );
    const instances = new MongoProviderInstanceRegistry(db);
    const credentialStore = new MongoInstanceCredentialStore(db);
    const transitions = new MongoInstanceTransitionStore(db);
    await Promise.all([instances.init(), credentialStore.init(), transitions.init()]);
    const credentials = new EncryptedInstanceCredentials(credentialStore, secrets);
    const sources = bundledBootstrapSources();
    const system = new SystemBootstrap(sources);
    const host = new ProviderInstanceHost(
        env,
        credentials,
        system,
        NOOP_LOGGER,
        new ProviderExecutionSupport(),
        instances,
        sources,
    );
    const provisioner = new OfficialInstanceProvisioner(
        instances,
        transitions,
        (instance, transition, execution) => host.target(instance, transition, execution),
        {
            read: (id) => credentials.readAdministrator(id),
            clear: (id) => credentials.clearAdministrator(id),
            authorizeCreation: (actor) => authorizeHostedCreation(host, actor),
        },
    );
    const lifecycle = new ProviderInstanceLifecycle(
        instances,
        credentials,
        provisioner,
        system,
        env.CMS_SESSION_SECRET,
    );
    const hosting = await composeHosting({
        resourceRevision: (storageKey) =>
            new MongoSiteUpgradeStorage(client.db(instanceDatabaseName(storageKey))).readResourceRevision("default"),
        db,
        host,
        instances,
        credentials,
        provisioner,
        system,
        lifecycle,
        idempotencySecret: env.CMS_SESSION_SECRET,
        logger: NOOP_LOGGER,
        configuration: readHostingConfiguration({
            ULVIA_CONTROL_ORIGIN: "http://control.localhost",
            ULVIA_EDGE_ROUTING_SECRET: "edge-test-secret".repeat(3),
            ULVIA_CONTROL_BOOTSTRAP_FILE: bootstrapFile,
        }),
    });
    host.hosting = hosting.services;
    return {
        db,
        client,
        instances,
        host,
        hosting,
        credentials,
        bootstrapFile,
        provisioner,
        startProvider: async () => {
            const routing = await createRoutingRuntime(system, hosting.routing, "edge-test-secret".repeat(3));
            const tls = await createTlsRuntime(system, hosting.delivery.authority);
            return mountUlviaProvider({
                env,
                host,
                lifecycle,
                logger: NOOP_LOGGER,
                tls,
                authenticator: new ProviderInstanceAuthenticator(
                    new MongoInstanceAuthenticationReader(db, "ulvia-provider-control", secretCrypto),
                ),
                routing: { authority: hosting.routing, instances, authenticate: routing.authenticate },
            });
        },
        close: async () => {
            await hosting.delivery.stop();
            try {
                await host.close();
            } finally {
                for await (const instance of instances.scan()) {
                    await client.db(instanceDatabaseName(instance.storageKey)).dropDatabase();
                }
                await db.dropDatabase();
                await client.close();
                await rm(root, { recursive: true, force: true });
            }
        },
    };
}
