import { randomUUIDv7 } from "bun";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import { ContentConflictError, ContentStorageFormatError } from "content/application/core/validation/errors";
import { withOfflineMaintenance, assertMongoQuiescent } from "./guard";
import type { MaintenanceOptions } from "./guard";
import { referenceProjection, scanMaintenanceDocuments } from "./records";
import type { MaintenanceDocument } from "./records";

const protocol = "content-bloc-references-upgrade/v1";

export async function upgradeMongoContentReferences(db: Db, options: MaintenanceOptions) {
    return withOfflineMaintenance(
        db,
        options,
        async ({ prefix, comment, token: runner, assertHeld }) => {
            const metadata = db.collection<MaintenanceDocument>(prefix + "content_metadata");
            const blocs = db.collection<MaintenanceDocument>(prefix + "blocs");
            const marker = await metadata.findOne({ _id: "bloc-references" });
            if (marker && ![0, 1].includes(marker.version)) {
                throw new ContentStorageFormatError("Unsupported Bloc reference format");
            }
            let job = await metadata.findOne({ _id: "bloc-references-upgrade" });
            if (
                job &&
                (job.protocol !== protocol ||
                    typeof job.token !== "string" ||
                    !["running", "complete"].includes(job.phase) ||
                    !(job.cursor === null || typeof job.cursor === "string"))
            ) {
                throw new ContentStorageFormatError("Invalid persisted Bloc reference upgrade journal");
            }
            if (marker?.version === 1 && !marker.upgradeToken) {
                let scanned = 0;
                for await (const row of scanMaintenanceDocuments(blocs)) {
                    if (!isDeepStrictEqual(row.contentReferences, referenceProjection(row))) {
                        throw new ContentStorageFormatError(
                            "Ready Bloc projection is inconsistent; repair the source before upgrading",
                        );
                    }
                    scanned++;
                    await assertHeld();
                }
                return { scanned, updated: 0, resumed: false, complete: true };
            }
            if (marker?.upgradeToken && !job) {
                throw new ContentStorageFormatError("Missing Blob reference upgrade journal");
            }
            const resumed = !!job;
            if (!job) {
                job = {
                    _id: "bloc-references-upgrade",
                    protocol,
                    token: randomUUIDv7(),
                    phase: "running",
                    cursor: null,
                };
                await metadata.insertOne(job, { comment });
            }
            if (marker?.upgradeToken && marker.upgradeToken !== job.token) {
                throw new ContentConflictError("Another Bloc projection upgrade owns readiness");
            }
            const started = await metadata.updateOne(
                { _id: "bloc-references", "maintenance.token": runner },
                { $set: { version: 1, upgradeToken: job.token } },
                { comment },
            );
            if (started.matchedCount !== 1) {
                throw new ContentConflictError("Bloc upgrade lease was lost");
            }
            let scanned = 0;
            let updated = 0;
            for await (const row of scanMaintenanceDocuments(blocs, job.cursor)) {
                await assertHeld();
                const projection = referenceProjection(row);
                if (!isDeepStrictEqual(row.contentReferences, projection)) {
                    const { contentReferences: previous, ...source } = row;
                    const result = await blocs.updateOne(
                        { ...source, contentReferences: previous === undefined ? { $exists: false } : previous },
                        { $set: { contentReferences: projection } },
                        { comment },
                    );
                    if (result.matchedCount !== 1) {
                        throw new ContentConflictError("A Bloc changed during the offline projection upgrade");
                    }
                    updated++;
                }
                scanned++;
                const saved = await metadata.updateOne(
                    { _id: job._id, token: job.token, cursor: job.cursor },
                    { $set: { cursor: row._id } },
                    { comment },
                );
                if (saved.matchedCount !== 1) {
                    throw new ContentConflictError("Bloc upgrade progress changed");
                }
                job.cursor = row._id;
            }
            // Recheck the full projection before publication, including previously checkpointed rows.
            for await (const row of scanMaintenanceDocuments(blocs)) {
                if (!isDeepStrictEqual(row.contentReferences, referenceProjection(row))) {
                    throw new ContentConflictError("Bloc projection verification failed");
                }
                await assertHeld();
            }
            await assertMongoQuiescent(db, comment);
            await assertHeld();
            await metadata.updateOne({ _id: job._id, token: job.token }, { $set: { phase: "complete" } }, { comment });
            const ready = await metadata.updateOne(
                { _id: "bloc-references", version: 1, upgradeToken: job.token, "maintenance.token": runner },
                { $set: {}, $unset: { upgradeToken: "" } },
                { comment },
            );
            if (ready.matchedCount !== 1) {
                throw new ContentConflictError("Bloc projection readiness ownership changed");
            }
            return { scanned, updated, resumed, complete: true };
        },
        true,
    );
}
