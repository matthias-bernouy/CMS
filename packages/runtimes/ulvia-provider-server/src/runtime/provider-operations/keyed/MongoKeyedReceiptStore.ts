import type { Collection, Db } from "mongodb";
import type { KeyedOutcome, KeyedReceipt, KeyedReceiptStore } from "./interfaces";

type ReceiptDocument = Omit<KeyedReceipt, "id"> & { _id: string; createdAt: Date };

/** One indexed receipt per exact command scope/key; no message body or credential is retained. */
export class MongoKeyedReceiptStore implements KeyedReceiptStore {
    private readonly records: Collection<ReceiptDocument>;

    constructor(db: Db) {
        this.records = db.collection("ulvia_provider_keyed_receipts", {
            writeConcern: { w: "majority", j: true },
            readConcern: { level: "majority" },
        });
    }

    async claim(id: string, fingerprint: string): Promise<Readonly<{ created: boolean; receipt: KeyedReceipt }>> {
        try {
            await this.records.insertOne({ _id: id, fingerprint, state: "pending", createdAt: new Date() });
            return { created: true, receipt: { id, fingerprint, state: "pending" } };
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const receipt = await this.records.findOne({ _id: id });
            if (!receipt) {
                throw new Error("Durable command receipt is unavailable");
            }
            return { created: false, receipt: { ...receipt, id: receipt._id } };
        }
    }

    async complete(id: string, fingerprint: string, outcome: KeyedOutcome): Promise<void> {
        const result = await this.records.updateOne(
            { _id: id, fingerprint, state: "pending" },
            {
                $set: { state: "complete", outcome: structuredClone(outcome) },
            },
        );
        if (result.modifiedCount !== 1) {
            throw new Error("Durable command receipt lost its pending ownership");
        }
    }
}
