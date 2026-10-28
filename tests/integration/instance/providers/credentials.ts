import { docker } from "../containers";

// This test harness opens only its disposable containers. Credentials never enter diagnostics.
export async function readProviderCredential(providerName: string, key: string, connectionId?: string) {
    const script = `
        import { MongoClient } from "mongodb";
        import { NOOP_LOGGER } from "@bernouy/logging";
        import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
        import { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        import { createEnvelopeSecretCrypto } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/envelopeCrypto";
        import { EncryptedInstanceCredentials } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/authentication/EncryptedInstanceCredentials";
        import { MongoInstanceCredentialStore } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/authentication/MongoInstanceCredentialStore";
        import { MongoProviderInstanceRegistry } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/instances/MongoProviderInstanceRegistry";
        import { createProviderStores } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/providerStores";
        import { instanceMongoUrl } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/storageRoots";
        const env = readProviderRuntimeEnv(process.env);
        const mongo = new MongoClient(env.MONGO_URL);
        let stores;
        try {
            await mongo.connect();
            const db = mongo.db();
            const secretCrypto = await createEnvelopeSecretCrypto(db, env.CMS_KEK);
            const secrets = new EncryptedMongoSecretStore({ scopeId: "ulvia-provider-control", collection: db.collection("ulvia_provider_secrets"), secretCrypto });
            const credentials = new EncryptedInstanceCredentials(new MongoInstanceCredentialStore(db), secrets);
            const instance = await new MongoProviderInstanceRegistry(db).getByIdempotencyKey(${JSON.stringify(key)});
            if (!instance) { throw new Error("Test instance unavailable"); }
            const runtime = await credentials.read(instance.id);
            if (!runtime) { throw new Error("Test credential unavailable"); }
            let result = { token: runtime.invocationSecret };
            if (${JSON.stringify(connectionId ?? "")}) {
                stores = await createProviderStores({ instanceId: instance.id, MONGO_URL: instanceMongoUrl(env.MONGO_URL, instance.storageKey), CMS_KEK: { activeKeyId: "instance", keysHex: { instance: runtime.kekHex }, rotateOnStart: false }, CMS_FILES_DIR: env.CMS_FILES_DIR + "/" + instance.storageKey, CMS_SESSION_SECRET: runtime.sessionSecret, CMS_PUBLIC_URL: instance.cmsUrl }, NOOP_LOGGER);
                result = await new ProviderConnections(stores.providerConnections).get(${JSON.stringify(connectionId ?? "")});
                if (!result) { throw new Error("Test connection unavailable"); }
            }
            await Bun.write(Bun.stdout, JSON.stringify(result));
        } finally { await stores?.close(); await mongo.close(); }
    `;
    const result = await docker([
        "exec",
        "--workdir",
        "/app/packages/runtimes/ulvia-provider-server",
        providerName,
        "bun",
        "--no-macros",
        "-e",
        script,
    ]);
    return JSON.parse(result.stdout) as { token: string; connectionId?: string; cmsUrl?: string };
}
