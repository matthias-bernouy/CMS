import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { createOfficialRepositoryApplication } from "../../src/application";
import { keyPair, simpleContract } from "./fixtures";

test("official namespace follows public first-claim ownership, owner publication and irreversible revocation", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-ownership-policy-"));
    const owner = keyPair();
    const replacement = keyPair();
    let application = await createOfficialRepositoryApplication(root);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => application.handle(request) });
    const client = new RepositoryNamespaceClient(server.url.origin);
    try {
        const repositoryId = await client.identity();
        const credential = {
            namespace: "ulvia.official",
            repositoryId,
            revision: 0,
            resolvePrivateKey: async () => owner.privateKey,
        };
        await client.claim(credential, owner.publicKey);
        const owned = { ...credential, revision: 1 };
        const stranger = { ...credential, resolvePrivateKey: async () => replacement.privateKey };
        await expect(client.claim(stranger, replacement.publicKey)).rejects.toThrow();
        const envelope = { kind: "contract" as const, canonicalJson: simpleContract("ulvia.official"), assets: [] };
        expect((await new RemoteRepositoryClient(server.url.origin, owned).push(envelope)).added).toBe(true);
        await expect(
            new RemoteRepositoryClient(server.url.origin, {
                ...owned,
                resolvePrivateKey: async () => replacement.privateKey,
            }).push({
                ...envelope,
                canonicalJson: simpleContract("ulvia.official", "1.1.0"),
            }),
        ).rejects.toThrow();
        await client.rotate(owned, {
            publicKey: replacement.publicKey,
            resolvePrivateKey: async () => replacement.privateKey,
        });
        application = await createOfficialRepositoryApplication(root);
        expect((await client.get("ulvia.official"))?.publicKey).toBe(replacement.publicKey);
        await expect(
            new RemoteRepositoryClient(server.url.origin, owned).push({
                ...envelope,
                canonicalJson: simpleContract("ulvia.official", "1.1.0"),
            }),
        ).rejects.toThrow();
        await client.revoke({ ...owned, revision: 2, resolvePrivateKey: async () => replacement.privateKey });
        application = await createOfficialRepositoryApplication(root);
        expect((await client.get("ulvia.official"))?.revoked).toBe(true);
        expect((await client.get("ulvia.official"))?.revision).toBe(3);
        await expect(client.claim(credential, owner.publicKey)).rejects.toThrow();
    } finally {
        server.stop(true);
        await rm(root, { recursive: true, force: true });
    }
});
