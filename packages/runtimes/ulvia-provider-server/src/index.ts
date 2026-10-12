import { MongoClient } from "mongodb";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { ValidatingSecretStore } from "@bernouy/secret-store";
import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
import { OfficialInstanceProvisioner, ProviderInstanceLifecycle } from "@bernouy/ulvia-provider";
import { EncryptedInstanceCredentials } from "./runtime/authentication/EncryptedInstanceCredentials";
import { MongoInstanceCredentialStore } from "./runtime/authentication/MongoInstanceCredentialStore";
import { ProviderInstanceAuthenticator } from "./runtime/authentication/ProviderInstanceAuthenticator";
import { createEnvelopeSecretCrypto } from "./runtime/stores/envelopeCrypto";
import { ProviderInstanceHost } from "./runtime/instances/ProviderInstanceHost";
import { MongoProviderInstanceRegistry } from "./runtime/instances/MongoProviderInstanceRegistry";
import { loadOfficialContracts } from "./runtime/instances/officialArtifacts";
import { mountUlviaProvider } from "./runtime/mountUlviaProvider";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readProviderRuntimeEnv } from "./runtimeEnv";

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
await Promise.all([instances.init(), credentialStore.init()]);
const credentials = new EncryptedInstanceCredentials(credentialStore, secrets);
const host = new ProviderInstanceHost(env, credentialStore, secrets);

let provider;
try {
    const contracts = await loadOfficialContracts(
        new HttpProviderRepository("ulvia-provider-runtime", env.CMS_REPOSITORY_URL),
    );
    const provisioner = new OfficialInstanceProvisioner(instances, (instance) => host.target(instance));
    const lifecycle = new ProviderInstanceLifecycle(instances, credentials, provisioner, env.CMS_SESSION_SECRET);
    const authenticator = new ProviderInstanceAuthenticator(instances, credentialStore, secrets);
    provider = mountUlviaProvider({ env, contracts, authenticator, host, lifecycle });
} catch (error) {
    await Promise.allSettled([host.close(), mongo.close()]);
    throw error;
}

let stopping = false;
const shutdown = async (signal: string) => {
    if (stopping) {
        return;
    }
    stopping = true;
    console.log(`\n→ Stopping Ulvia Provider (${signal})...`);
    await provider.stop();
    await Promise.allSettled([host.close(), mongo.close()]);
};
const handleSignal = (signal: string): void => {
    void shutdown(signal).catch((error) => {
        console.error("Ulvia Provider shutdown failed", error);
        process.exitCode = 1;
    });
};
process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));
