import { FieldCrypto, encryptAesGcm, decryptAesGcm, asBuffer } from "@bernouy/envelope-crypto";
import { MongoUsersRepository, MongoLocalCredentialStore, MongoAccountEventStore } from "@bernouy/auth/mongo";
import type { Db } from "mongodb";

export async function accountMongoFixture(db: Db, prefix = "") {
    const key = Buffer.alloc(32, 7);
    const crypto = new FieldCrypto(
        "test",
        {
            encrypt: async (_scope, value) => encryptAesGcm(value, key),
            decrypt: async (_scope, blob) =>
                decryptAesGcm({ iv: asBuffer(blob.iv), ciphertext: asBuffer(blob.ciphertext) }, key).toString(),
        },
        key,
    );
    const recording = { enabled: () => true };
    const users = new MongoUsersRepository(db, crypto, { collectionPrefix: prefix, events: recording });
    const credentials = new MongoLocalCredentialStore(db, crypto, { collectionPrefix: prefix, events: recording });
    const events = new MongoAccountEventStore(db, prefix, crypto);
    await credentials.init();
    await events.init();
    return { db, users, credentials, events, prefix };
}
