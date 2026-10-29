import { expect } from "bun:test";
import { docker } from "../containers";

/** A real encrypted BSON join must keep revocation fresh even with decoded keys cached. */
export async function exerciseAuthenticationMaterial(providerName: string, stackId: string) {
    const database = `ulvia_auth_${stackId.replaceAll("-", "_")}`;
    const script = `
        import { strict as assert } from "node:assert";
        import { createHash } from "node:crypto";
        import { MongoClient } from "mongodb";
        import { encryptAesGcm, decryptAesGcm } from "@bernouy/envelope-crypto";
        import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
        import { authenticationDocument, runtimeSecrets } from "/app/packages/runtimes/ulvia-provider-server/tests/authentication/material/fixture";
        import { MongoInstanceAuthenticationReader } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/authentication/material/MongoInstanceAuthenticationReader";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        const name = ${JSON.stringify(database)};
        assert.match(name, /^ulvia_auth_[a-z0-9_]+$/);
        const client = new MongoClient(readProviderRuntimeEnv(process.env).MONGO_URL, { monitorCommands: true });
        let commands = 0;
        client.on("commandStarted", () => { commands++; });
        await client.connect();
        const db = client.db(name);
        const scope = "authentication-integration";
        let decrypts = 0;
        let revokeDuringDecrypt = false;
        const key = scopeId => createHash("sha256").update(scopeId).digest();
        const crypto = {
            encrypt: async (scopeId, value) => encryptAesGcm(value, key(scopeId)),
            decrypt: async (scopeId, blob) => {
                decrypts++;
                if (revokeDuringDecrypt) { await db.collection("ulvia_provider_instance_credentials").updateOne({}, { $set: { enabled: false } }); }
                return decryptAesGcm(blob, key(scopeId)).toString();
            },
        };
        try {
            const document = authenticationDocument();
            const { secret, instance, ...credential } = document;
            await db.collection("ulvia_provider_instances").insertOne(instance);
            await db.collection("ulvia_provider_instances").createIndex({ id: 1 }, { unique: true });
            const credentials = db.collection("ulvia_provider_instance_credentials");
            await credentials.insertOne(credential);
            await credentials.createIndex({ accessTokenHash: 1 }, { unique: true });
            await credentials.createIndex({ invocationKeyId: 1 }, { unique: true });
            const secrets = new EncryptedMongoSecretStore({ scopeId: scope, collection: db.collection("ulvia_provider_secrets"), secretCrypto: crypto });
            await secrets.set(credential.secretKey, JSON.stringify(runtimeSecrets));
            const reader = new MongoInstanceAuthenticationReader(db, scope, crypto);
            const selector = { field: "accessTokenHash", value: credential.accessTokenHash };
            const coldBefore = commands;
            const material = await reader.read(selector);
            assert.equal(material.instance.id, instance.id);
            assert.equal(commands - coldBefore, 2);
            const before = commands;
            assert.deepEqual(await reader.read(selector), material);
            assert.equal(commands - before, 1);
            assert.equal(decrypts, 1);
            await credentials.updateOne({}, { $set: { enabled: false } });
            assert.equal(await reader.read(selector), null);
            await credentials.updateOne({}, { $set: { enabled: true } });
            await db.collection("ulvia_provider_instances").updateOne({}, { $set: { status: "disabled" } });
            assert.equal(await reader.read(selector), null);
            await db.collection("ulvia_provider_instances").updateOne({}, { $set: { status: "ready" } });
            await secrets.set(credential.secretKey, JSON.stringify({ ...runtimeSecrets, invocationSecret: "R".repeat(43) }));
            assert.equal((await reader.read(selector)).secrets.invocationSecret, "R".repeat(43));
            assert.equal(decrypts, 2);
            await secrets.set(credential.secretKey, JSON.stringify(runtimeSecrets));
            revokeDuringDecrypt = true;
            assert.equal(await reader.read(selector), null);
            revokeDuringDecrypt = false;
            await credentials.updateOne({}, { $set: { enabled: true } });
            await secrets.delete(credential.secretKey);
            assert.equal(await reader.read(selector), null);
            console.log(JSON.stringify({ warmCommands: 1, revocationFresh: true, rotationFresh: true, missingDenied: true }));
        } finally { await db.dropDatabase(); await client.close(); }
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
    expect(JSON.parse(result.stdout.trim())).toEqual({
        warmCommands: 1,
        revocationFresh: true,
        rotationFresh: true,
        missingDenied: true,
    });
}
