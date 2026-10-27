import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { asBuffer, type EncryptedBlob, type SecretCrypto } from "@bernouy/envelope-crypto";
import type { ProviderConnectionStorage } from "@bernouy/cms-gateway/provider/node";

type Document = { _id: string; payload: EncryptedBlob; valueHash: string };
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

/** Account-scoped encryption and atomic replacement prevent stale pairing requests restoring old keys. */
export class EncryptedProviderConnections implements ProviderConnectionStorage {
    private readonly documents;
    constructor(
        db: Db,
        private readonly crypto: SecretCrypto,
        private readonly scope: string,
    ) {
        this.documents = db.collection<Document>("cms_provider_return_connections");
    }
    async get(key: string) {
        const value = await this.documents.findOne({ _id: key }, { maxTimeMS: 2000 });
        return value
            ? this.crypto.decrypt(this.scope, {
                  ciphertext: asBuffer(value.payload.ciphertext),
                  iv: asBuffer(value.payload.iv),
              })
            : null;
    }
    async compareAndSet(key: string, expected: string | null, value: string) {
        const document: Document = {
            _id: key,
            payload: await this.crypto.encrypt(this.scope, value),
            valueHash: fingerprint(value),
        };
        if (expected === null) {
            try {
                await this.documents.insertOne(document, { writeConcern: { w: "majority" } });
                return true;
            } catch (error) {
                if ((error as { code?: number })?.code === 11000) {
                    return false;
                }
                throw error;
            }
        }
        const result = await this.documents.replaceOne({ _id: key, valueHash: fingerprint(expected) }, document, {
            writeConcern: { w: "majority" },
        });
        return result.matchedCount === 1;
    }
}
