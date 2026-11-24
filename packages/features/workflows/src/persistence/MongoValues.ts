import { createHash } from "node:crypto";
import { ReadConcern } from "mongodb";
import type { Db } from "mongodb";
import type { FieldCrypto, EncryptedBlob } from "@bernouy/envelope-crypto";
import { canonicalizeIJson, parseStrictJson, MAX_CAPABILITY_JSON_BYTES } from "@bernouy/ulvia-contracts/protocol";
import type { WorkflowValues } from "workflows/interfaces/store";
import { WorkflowError } from "workflows/core/errors";
type Value = { _id: string; runId: string; digest: string; chunks: readonly string[] };
type Chunk = { _id: string; runId: string; blob: EncryptedBlob };
/** Business values are encrypted, bounded and immutable; root publication follows all chunk writes. */
export class MongoWorkflowValues implements WorkflowValues {
    constructor(
        private readonly db: Db,
        private readonly crypto: Pick<FieldCrypto, "encrypt" | "decrypt">,
    ) {
        this.db = db.client.db(db.databaseName, {
            writeConcern: { w: "majority", j: true },
            readConcern: new ReadConcern("majority"),
        });
    }
    private async assertWritable(runId: string) {
        const removed = await this.db
            .collection<{ _id: string; purging?: boolean; discarded?: boolean }>("workflow_runs")
            .findOne(
                { _id: runId, $or: [{ purging: true }, { discarded: true }] },
                { projection: { _id: 1 }, maxTimeMS: 2000 },
            );
        if (removed) {
            throw new WorkflowError("INVALID_STATE");
        }
    }
    async accept(runId: string) {
        await this.db
            .collection<{ _id: string; accepted: boolean }>("workflow_value_scopes")
            .updateOne({ _id: runId }, { $set: { accepted: true } });
    }
    private async prepareScope(runId: string) {
        if (runId.startsWith("definition:") || runId.startsWith("installation:")) {
            return;
        }
        try {
            await this.db
                .collection<{ _id: string; accepted: boolean; createdAt: Date }>("workflow_value_scopes")
                .updateOne(
                    { _id: runId },
                    { $setOnInsert: { accepted: false, createdAt: new Date() } },
                    { upsert: true },
                );
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
        }
    }
    async purge(runId: string, limit: number) {
        const chunks = this.db.collection<Chunk>("workflow_value_chunks");
        const values = this.db.collection<Value>("workflow_values");
        for (const collection of [chunks, values]) {
            const rows = await collection
                .find({ runId }, { projection: { _id: 1 }, maxTimeMS: 2000 })
                .limit(limit)
                .toArray();
            if (rows.length) {
                await collection.deleteMany({ runId, _id: { $in: rows.map(({ _id }) => _id) } });
            }
        }
        const complete =
            !(await chunks.findOne({ runId }, { projection: { _id: 1 }, maxTimeMS: 2000 })) &&
            !(await values.findOne({ runId }, { projection: { _id: 1 }, maxTimeMS: 2000 }));
        if (complete) {
            await this.db.collection<{ _id: string }>("workflow_value_scopes").deleteOne({ _id: runId });
        }
        return complete;
    }
    async put(runId: string, slot: string, value: unknown) {
        await this.assertWritable(runId);
        const json = canonicalizeIJson(value);
        const bytes = Buffer.from(json);
        if (bytes.byteLength > MAX_CAPABILITY_JSON_BYTES) {
            throw new WorkflowError("VALUE_TOO_LARGE");
        }
        await this.prepareScope(runId);
        const digest = createHash("sha256").update(bytes).digest("hex");
        const id = createHash("sha256")
            .update(JSON.stringify([runId, slot]))
            .digest("hex");
        const values = this.db.collection<Value>("workflow_values");
        const existing = await values.findOne({ _id: id, runId }, { maxTimeMS: 2000 });
        if (existing) {
            if (existing.digest !== digest) {
                throw new WorkflowError("VALUE_CONFLICT");
            }
            return id;
        }
        const chunks: string[] = [];
        for (let offset = 0; offset < bytes.byteLength; offset += 4194304) {
            const chunkId = `${id}:${digest}:${chunks.length}`;
            const blob = await this.crypto.encrypt(bytes.subarray(offset, offset + 4194304).toString("base64"));
            try {
                await this.db.collection<Chunk>("workflow_value_chunks").insertOne({ _id: chunkId, runId, blob });
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) {
                    throw error;
                }
            }
            chunks.push(chunkId);
        }
        try {
            await values.insertOne({ _id: id, runId, digest, chunks });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const winner = await values.findOne({ _id: id, runId }, { maxTimeMS: 2000 });
            if (winner?.digest !== digest) {
                throw new WorkflowError("VALUE_CONFLICT");
            }
        }
        try {
            await this.assertWritable(runId);
        } catch (error) {
            await this.purge(runId, 64);
            throw error;
        }
        return id;
    }
    async get(runId: string, reference: string) {
        const value = await this.db
            .collection<Value>("workflow_values")
            .findOne({ _id: reference, runId }, { maxTimeMS: 2000 });
        if (!value || !Array.isArray(value.chunks) || value.chunks.length > 5) {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for (const id of value.chunks) {
            const row = await this.db
                .collection<Chunk>("workflow_value_chunks")
                .findOne({ _id: id }, { maxTimeMS: 2000 });
            if (!row) {
                throw new WorkflowError("CORE_UNAVAILABLE");
            }
            const bytes = Buffer.from(await this.crypto.decrypt(row.blob), "base64");
            size += bytes.byteLength;
            if (size > MAX_CAPABILITY_JSON_BYTES) {
                throw new WorkflowError("VALUE_TOO_LARGE");
            }
            chunks.push(bytes);
        }
        const bytes = Buffer.concat(chunks);
        if (createHash("sha256").update(bytes).digest("hex") !== value.digest) {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        return parseStrictJson(bytes, MAX_CAPABILITY_JSON_BYTES, 64);
    }
}
