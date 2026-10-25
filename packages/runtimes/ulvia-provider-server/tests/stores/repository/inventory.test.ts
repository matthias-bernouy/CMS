import { expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import { RepositoryPublisher } from "../../../src/runtime/stores/repository/RepositoryPublisher";
import { authoringFixture } from "../../../../official-repository-server/tests/authoring/fixture";
import { DatabaseFixture } from "./database";

test("namespace inventory persists claims and imports, paginates and rechecks ownership after rotation and revocation", async () => {
    const f = await authoringFixture();
    try {
        const db = new DatabaseFixture();
        const secrets = new InMemorySecretStore();
        await secrets.set("REPOSITORY_SIGNING_KEY", await f.credential.resolvePrivateKey());
        const publisher = () => new RepositoryPublisher(f.base, "local", secrets, db as any);
        const p = publisher();
        expect((await p.listNamespaces()).items).toEqual([]);
        expect((await p.trackNamespace("community")).access).toBe("owned");
        await p.claim("community.extra");
        const first = await publisher().listNamespaces({ limit: 1 });
        expect(first.items.map((x) => x.namespace)).toEqual(["community"]);
        const second = await p.listNamespaces({ cursor: first.nextCursor!, limit: 1 });
        expect(second.items[0]!.namespace).toBe("community.extra");
        expect(second.nextCursor).toBeNull();
        const client = new RepositoryNamespaceClient(f.base);
        const extra = await p.credential("community.extra");
        await client.revoke(extra);
        const pair = generateKeyPairSync("ed25519");
        const replacement = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
        await client.rotate(f.credential, {
            publicKey: createPublicKey(replacement).export({ format: "der", type: "spki" }).toString("base64url"),
            resolvePrivateKey: async () => replacement,
        });
        expect((await p.listNamespaces()).items.map((x) => x.access)).toEqual(["transferred", "revoked"]);
        await expect(p.credential("community")).rejects.toThrow("does not own");
        await expect(p.trackNamespace("community.extra")).rejects.toThrow("does not own");
        await db
            .collection("cms_repository_namespaces")
            .updateOne({ _id: "community.pending" }, { $set: { repositoryId: f.credential.repositoryId } });
        expect((await p.listNamespaces()).items.find((x) => x.namespace === "community.pending")!.access).toBe(
            "missing",
        );
        await expect(p.credential("community.pending")).rejects.toThrow("does not own");
        expect(JSON.stringify(await p.listNamespaces())).not.toContain("PRIVATE KEY");
    } finally {
        await f.close();
    }
});
