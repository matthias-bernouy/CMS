import type { Db } from "mongodb";
import { asBuffer, type SecretCrypto } from "@bernouy/envelope-crypto";
import type {
    ProviderConnectionDraftStore,
    PendingProviderConnection,
} from "@bernouy/cms-repository/providers/management";

export class EncryptedConnectionDrafts implements ProviderConnectionDraftStore {
    private readonly documents;
    constructor(
        db: Db,
        private readonly crypto: SecretCrypto,
        private readonly scope: string,
    ) {
        this.documents = db.collection<{
            _id: string;
            payload: Awaited<ReturnType<SecretCrypto["encrypt"]>>;
            expiresAt: Date;
        }>("cms_provider_connection_drafts");
    }
    async init() {
        await this.documents.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }
    async get(ticket: string) {
        const document = await this.documents.findOne({ _id: ticket, expiresAt: { $gt: new Date() } });
        return document
            ? (JSON.parse(
                  await this.crypto.decrypt(this.scope, {
                      ciphertext: asBuffer(document.payload.ciphertext),
                      iv: asBuffer(document.payload.iv),
                  }),
              ) as PendingProviderConnection)
            : undefined;
    }
    async set(ticket: string, draft: PendingProviderConnection) {
        if (
            (await this.documents.countDocuments({ expiresAt: { $gt: new Date() } }, { limit: 100 })) >= 100 &&
            !(await this.documents.findOne({ _id: ticket }))
        ) {
            throw new Error("Too many pending Provider connections");
        }
        await this.documents.updateOne(
            { _id: ticket },
            {
                $set: {
                    payload: await this.crypto.encrypt(this.scope, JSON.stringify(draft)),
                    expiresAt: new Date(draft.createdAt + 300_000),
                },
            },
            { upsert: true, writeConcern: { w: "majority" } },
        );
    }
    async delete(ticket: string) {
        await this.documents.deleteOne({ _id: ticket });
    }
}
