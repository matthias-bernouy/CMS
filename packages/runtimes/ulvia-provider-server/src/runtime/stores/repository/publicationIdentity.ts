import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import type { SecretStore } from "@bernouy/secret-store";
import type { Db } from "mongodb";

export async function loadPublicationIdentity(
    repositoryUrl: string,
    repositoryId: string,
    secrets: SecretStore,
    db: Db,
) {
    repositoryUrl = new URL(repositoryUrl).href;
    const records = db.collection<{
        _id: string;
        secretName: string;
        repositoryId: string;
        repositoryUrl: string;
    }>("cms_repository_identity");
    let record = await records.findOne({ _id: "publication" });
    if (!record) {
        const configured = await secrets.get("REPOSITORY_SIGNING_KEY");
        const key =
            configured ?? generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
        if (createPrivateKey(key).asymmetricKeyType !== "ed25519") {
            throw new Error("Repository signing identity must use Ed25519");
        }
        const secretName = `REPOSITORY_KEY_${randomUUID().replaceAll("-", "").toUpperCase()}`;
        await secrets.set(secretName, key);
        try {
            await records.insertOne({ _id: "publication", secretName, repositoryId, repositoryUrl });
        } catch (error) {
            const persisted = await records.findOne({ _id: "publication" });
            if (!persisted) {
                throw error;
            }
            // An acknowledged failure may still be our committed write.
            if (persisted.secretName !== secretName) {
                await secrets.delete(secretName);
            }
        }
        record = await records.findOne({ _id: "publication" });
    }
    if (record && (record.repositoryId !== repositoryId || record.repositoryUrl !== repositoryUrl)) {
        throw new Error("Repository identity or endpoint changed");
    }
    const key = record ? await secrets.get(record.secretName) : null;
    if (!key || createPrivateKey(key).asymmetricKeyType !== "ed25519") {
        throw new Error("Repository signing identity is unavailable");
    }
    return {
        key,
        repositoryId,
        publicKey: createPublicKey(key).export({ format: "der", type: "spki" }).toString("base64url"),
    };
}
