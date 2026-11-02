import type { Db } from "mongodb";
import type { DocumentationVectorStore } from "../interfaces/Documentation";
import { normalizedVector } from "../core/ranking";

/** Rebuildable model/content-derived vectors, with bounded reads and automatic expiry. */
export class MongoDocumentationVectors implements DocumentationVectorStore {
    private readonly rows;
    private initialized?: Promise<void>;
    constructor(db: Db) {
        this.rows = db.collection<{ _id: string; vector: number[]; expiresAt: Date }>("cms_documentation_vectors");
    }
    init(): Promise<void> {
        this.initialized ??= this.rows
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
            .then(() => undefined)
            .catch((error) => {
                this.initialized = undefined;
                throw error;
            });
        return this.initialized;
    }
    async get(keys: readonly string[]): Promise<ReadonlyMap<string, readonly number[]>> {
        if (keys.length > 4096) {
            throw new Error("Vector read limit exceeded");
        }
        await this.init();
        const rows = await this.rows
            .find({ _id: { $in: [...keys] }, expiresAt: { $gt: new Date() } }, { maxTimeMS: 2000 })
            .limit(keys.length || 1)
            .toArray();
        const vectors = new Map(
            rows.flatMap((row) => {
                try {
                    return [[row._id, normalizedVector(row.vector)] as const];
                } catch {
                    // Derived cache rows can be discarded and rebuilt from admitted document bytes.
                    return [];
                }
            }),
        );
        const soon = new Date(Date.now() + 7 * 86_400_000);
        if (rows.some((row) => vectors.has(row._id) && row.expiresAt < soon)) {
            await this.rows.updateMany(
                { _id: { $in: [...vectors.keys()] }, expiresAt: { $gt: new Date(), $lt: soon } },
                { $set: { expiresAt: new Date(Date.now() + 30 * 86_400_000) } },
                { maxTimeMS: 2000 },
            );
        }
        return vectors;
    }
    async put(values: readonly { key: string; vector: readonly number[] }[]): Promise<void> {
        if (values.length > 16) {
            throw new Error("Vector write batch exceeds limit");
        }
        if (!values.length) {
            return;
        }
        await this.init();
        await this.rows.bulkWrite(
            values.map((row) => ({
                updateOne: {
                    filter: { _id: row.key },
                    update: {
                        $set: {
                            vector: [...normalizedVector(row.vector)],
                            expiresAt: new Date(Date.now() + 30 * 86_400_000),
                        },
                    },
                    upsert: true,
                },
            })),
        );
    }
}
