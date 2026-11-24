import { createHash } from "node:crypto";
import { ReadConcern } from "mongodb";
import type { Db } from "mongodb";
import type { SchemaDescriptor } from "@bernouy/ulvia-contracts/schema";
import { SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { SchemaVersionStore, SchemaVersionScope } from "./interfaces";

/** One atomic immutable record; safe across hosts without multi-document transactions. */
export class MongoSchemaVersions implements SchemaVersionStore {
    readonly #db: Db;
    constructor(db: Db) {
        this.#db = db.client.db(db.databaseName, {
            writeConcern: { w: "majority", j: true },
            readConcern: new ReadConcern("majority"),
        });
    }
    async seal(scope: SchemaVersionScope, descriptor: SchemaDescriptor): Promise<void> {
        if (
            [
                scope.siteId,
                scope.providerId,
                scope.installationId,
                scope.instanceId,
                scope.contractId,
                scope.resolverId,
            ].some((value) => !value || typeof value !== "string") ||
            typeof descriptor.resourceId !== "string" ||
            !descriptor.resourceId ||
            typeof descriptor.version !== "string" ||
            !descriptor.version ||
            !/^sha256:[a-f0-9]{64}$/u.test(descriptor.digest)
        ) {
            throw new TypeError("Missing schema version scope");
        }
        const identity = { ...scope, resourceId: descriptor.resourceId, version: descriptor.version };
        const _id = createHash("sha256").update(canonicalizeIJson(identity)).digest("hex");
        const collection = this.#db.collection<{ _id: string; digest: string }>("schema_versions");
        try {
            await collection.insertOne({ _id, digest: descriptor.digest });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const previous = await collection.findOne({ _id }, { maxTimeMS: 2000 });
            if (previous?.digest !== descriptor.digest) {
                throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT");
            }
        }
    }
}
