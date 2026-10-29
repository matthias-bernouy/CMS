import { expect } from "bun:test";
import { docker } from "../containers";

/** Validate one-command namespace reads, narrowing filters and domain gates on real encrypted BSON. */
export async function exerciseNamedSecretResolution(providerName: string, stackId: string) {
    const database = `ulvia_secrets_${stackId.replaceAll("-", "_")}`;
    const script = `
        import { strict as assert } from "node:assert";
        import { createHash } from "node:crypto";
        import { MongoClient } from "mongodb";
        import { CmsSecrets } from "@bernouy/cms-secrets";
        import { MongoCmsSecretMetadataStore } from "@bernouy/cms-secrets/mongo";
        import { encryptAesGcm, decryptAesGcm } from "@bernouy/envelope-crypto";
        import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
        import { MongoCmsSecretResolutionReader } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/secrets/MongoCmsSecretResolutionReader";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        const name = ${JSON.stringify(database)};
        assert.match(name, /^ulvia_secrets_[a-z0-9_]+$/);
        const client = new MongoClient(readProviderRuntimeEnv(process.env).MONGO_URL, { monitorCommands: true });
        let commands = 0;
        client.on("commandStarted", () => { commands++; });
        await client.connect();
        const db = client.db(name);
        let decrypts = 0;
        const key = scope => createHash("sha256").update(scope).digest();
        const crypto = {
            encrypt: async (scope, value) => encryptAesGcm(value, key(scope)),
            decrypt: async (scope, blob) => { decrypts++; return decryptAesGcm(blob, key(scope)).toString(); },
        };
        try {
            const metadata = new MongoCmsSecretMetadataStore({
                secrets: db.collection("cms_secret_metadata"), namespaces: db.collection("cms_secret_namespaces"),
                namespaceKeys: db.collection("cms_secret_namespace_keys"),
            });
            await metadata.init();
            const values = new EncryptedMongoSecretStore({ scopeId: "instance", collection: db.collection("cms_secrets"), secretCrypto: crypto });
            const reader = new MongoCmsSecretResolutionReader(db, "instance", crypto);
            const secrets = new CmsSecrets(metadata, values, { resolutionReader: reader });
            const a = await secrets.createNamespace({ name: "A", createdBy: { kind: "system", id: "test" } });
            const b = await secrets.createNamespace({ name: "B", createdBy: { kind: "system", id: "test" } });
            const first = await secrets.create(a.namespaceId, a.namespaceKey, "TOKEN", "A-value");
            await secrets.create(b.namespaceId, b.namespaceKey, "TOKEN", "B-value");
            const read = (token = a.namespaceKey, namespaceId = a.namespaceId) => secrets.resolveByName(namespaceId, token, "TOKEN");
            let before = commands;
            assert.equal((await read()).value, "A-value");
            assert.equal(commands - before, 1);
            before = commands;
            assert.equal((await read()).value, "A-value");
            assert.equal(commands - before, 1);
            assert.equal(decrypts, 2);
            assert.equal((await read(b.namespaceKey, b.namespaceId)).value, "B-value");
            const beforeDenied = decrypts;
            await assert.rejects(read(a.namespaceKey, b.namespaceId));
            await assert.rejects(read(a.namespaceKey + "invalid"));
            assert.equal(decrypts, beforeDenied);
            const proof = token => createHash("sha256").update(token).digest("base64url");
            const prepared = (token, namespaceId = a.namespaceId) => reader.read({
                namespaceId, keyId: token.split(".")[0], name: "TOKEN", verifier: proof(token),
                permissions: ["secrets.metadata.read", "secrets.resolve"], checkedAt: new Date(),
            });
            assert.equal((await prepared(a.namespaceKey + "invalid")).metadata, null);
            assert.equal((await prepared(a.namespaceKey, b.namespaceId)).metadata, null);
            for (const permissions of [["secrets.resolve"], ["secrets.metadata.read"]]) {
                const limited = await secrets.createNamespaceKey({ namespaceId: a.namespaceId, namespaceKey: a.namespaceKey, permissions });
                assert.equal((await prepared(limited.namespaceKey)).metadata, null);
                const before = decrypts;
                await assert.rejects(read(limited.namespaceKey));
                assert.equal(decrypts, before);
            }
            const expired = await secrets.createNamespaceKey({
                namespaceId: a.namespaceId, namespaceKey: a.namespaceKey,
                permissions: ["secrets.metadata.read", "secrets.resolve"], expiresAt: new Date(0),
            });
            assert.equal((await prepared(expired.namespaceKey)).metadata, null);
            await assert.rejects(read(expired.namespaceKey));
            await secrets.rotate(a.namespaceId, a.namespaceKey, first.secretId, 1, "rotated");
            assert.deepEqual({ value: (await read()).value, version: (await read()).version }, { value: "rotated", version: 2 });
            const replacement = await secrets.rotateNamespaceKey(a.namespaceId, a.namespaceKey, a.keyId);
            assert.equal((await prepared(a.namespaceKey)).metadata, null);
            await assert.rejects(read());
            assert.equal((await read(replacement.namespaceKey)).value, "rotated");
            const stored = await metadata.findByName(a.namespaceId, "TOKEN");
            await values.delete(stored.storageKey);
            await assert.rejects(read(replacement.namespaceKey), /value is unavailable/);
            await metadata.delete(stored.id, stored.version);
            assert.equal(await read(replacement.namespaceKey), null);
            await assert.rejects(new CmsSecrets(metadata, values, {
                resolutionReader: new MongoCmsSecretResolutionReader(db, "other-scope", crypto),
            }).resolveByName(b.namespaceId, b.namespaceKey, "TOKEN"));
            console.log(JSON.stringify({ commandsPerResolution: 1, plaintextCached: false, namespacesIsolated: true, revokedKeysDenied: true }));
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
        commandsPerResolution: 1,
        plaintextCached: false,
        namespacesIsolated: true,
        revokedKeysDenied: true,
    });
}
