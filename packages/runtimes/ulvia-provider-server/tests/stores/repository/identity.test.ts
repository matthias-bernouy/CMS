import { expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { loadPublicationIdentity } from "../../../src/runtime/stores/repository/publicationIdentity";
import { DatabaseFixture } from "./database";

function fixture() {
    const db = new DatabaseFixture();
    const secrets = new InMemorySecretStore();
    const load = () => loadPublicationIdentity("https://repository.example/", "repository-test", secrets, db as any);
    return { db, secrets, load, records: db.collection("cms_repository_identity") };
}
test("lost Mongo acknowledgment preserves the committed key and reloads the same identity", async () => {
    const f = fixture();
    f.records.onInsert = (record) => {
        f.records.records.set(record._id, record);
        throw new Error("Lost ACK");
    };
    const first = await f.load();
    const persisted = await f.records.findOne({ _id: "publication" });
    expect(await f.secrets.get(persisted.secretName)).toBe(first.key);
    expect((await f.load()).publicKey).toBe(first.publicKey);
});
test("a losing initializer deletes only its unused candidate key", async () => {
    const f = fixture();
    const winner = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    await f.secrets.set("WINNER", winner);
    let candidate = "";
    f.records.onInsert = (record) => {
        candidate = record.secretName;
        f.records.records.set(record._id, { ...record, secretName: "WINNER" });
        throw new Error("Duplicate key");
    };
    expect((await f.load()).publicKey).toBe(
        createPublicKey(winner).export({ format: "der", type: "spki" }).toString("base64url"),
    );
    expect(await f.secrets.get(candidate)).toBeNull();
    expect(await f.secrets.get("WINNER")).toBe(winner);
});
test("ambiguous or failed identity persistence retains the candidate instead of destroying it", async () => {
    for (const unreadable of [false, true]) {
        const f = fixture();
        let candidate = "";
        f.records.onInsert = (record) => {
            candidate = record.secretName;
            if (unreadable) {
                f.records.onRead = () => {
                    throw new Error("Read unavailable");
                };
            }
            throw new Error("Write unavailable");
        };
        await expect(f.load()).rejects.toThrow();
        expect(await f.secrets.get(candidate)).toBeString();
    }
});
test("missing persisted keys and changed Repository pins never regenerate authority", async () => {
    const f = fixture();
    await f.load();
    const record = await f.records.findOne({ _id: "publication" });
    await f.secrets.delete(record.secretName);
    await expect(f.load()).rejects.toThrow("unavailable");
    expect(f.records.records.size).toBe(1);
    await expect(
        loadPublicationIdentity("https://repository.example/", "changed-id", f.secrets, f.db as any),
    ).rejects.toThrow("changed");
    await expect(
        loadPublicationIdentity("https://other.example/", "repository-test", f.secrets, f.db as any),
    ).rejects.toThrow("changed");
});
