import { createHash } from "node:crypto";
import { BSON } from "mongodb";
import type { Db, Document } from "mongodb";
import { convertForm, convertVersion, convertSubmission } from "./convert";
import type { FormsV1Version } from "./convert";
export type FormsMigrationSummary = { forms: number; versions: number; submissions: number; digest: string };
/** Offline operator migration only. Never called by normal readers or startup recovery. */
export async function migrateFormsV1(
    db: Db,
    source: FormsV1Version,
    apply = false,
    exportSettings?: (value: unknown) => Promise<void>,
): Promise<FormsMigrationSummary> {
    if (apply) {
        if (!exportSettings) {
            throw new Error("Forms migration requires a private settings export");
        }
        await migrateFormsV1(db, source, false);
    }
    const hash = createHash("sha256");
    const count = { forms: 0, versions: 0, submissions: 0 };
    for (const [name, key, convert] of [
        ["forms", "forms", convertForm],
        ["form_versions", "versions", convertVersion],
        ["form_submissions", "submissions", (value: unknown) => ({ document: convertSubmission(value, source) })],
    ] as const) {
        const collection = db.collection<Document>(name, {
            readConcern: { level: "majority" },
            writeConcern: { w: "majority", j: true },
        });
        const cursor = collection.find({}).sort({ _id: 1 }).batchSize(25);
        try {
            for await (const row of cursor) {
                if (BSON.calculateObjectSize(row) > (name === "form_submissions" ? 262144 : 65536)) {
                    throw new Error("Forms migration document exceeds its size bound");
                }
                const result = convert(row);
                hash.update(name);
                hash.update(BSON.serialize(row));
                count[key]++;
                if (apply) {
                    if ("settings" in result && exportSettings) {
                        await exportSettings(result.settings);
                    }
                    const changed = await collection.replaceOne(
                        { _id: row._id, ...("nonce" in row ? { nonce: row.nonce } : { committed: row.committed }) },
                        result.document,
                    );
                    if (changed.matchedCount !== 1) {
                        throw new Error("Forms changed during offline migration");
                    }
                }
            }
        } finally {
            await cursor.close();
        }
    }
    return { ...count, digest: hash.digest("hex") };
}
