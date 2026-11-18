import { randomUUIDv7 } from "bun";
import type { Db } from "mongodb";
import {
    ContentConflictError,
    ContentStorageFormatError,
    ContentValidationError,
} from "content/application/core/validation/errors";
import { withOfflineMaintenance, assertMongoQuiescent } from "./guard";
import type { MaintenanceOptions } from "./guard";
import { auditMongoContentReferences } from "./audit";
import type { MaintenanceDocument } from "./records";

export async function recoverMongoContentReferenceFence(
    db: Db,
    options: MaintenanceOptions & {
        expectedToken: string;
        resolveExternalReference?: (tag: string) => Promise<boolean>;
    },
) {
    if (typeof options.expectedToken !== "string" || !options.expectedToken || options.expectedToken.length > 200) {
        throw new ContentValidationError("expectedToken", "the inspected fence token is required");
    }
    return withOfflineMaintenance(db, options, async ({ prefix, comment, assertHeld }) => {
        const metadata = db.collection<MaintenanceDocument>(prefix + "content_metadata");
        const format = await metadata.findOne({ _id: "bloc-references" });
        if (format?.version !== 1 || format.upgradeToken) {
            throw new ContentStorageFormatError(
                "Complete the explicit Bloc projection upgrade before recovering a reference fence",
            );
        }
        const locks = db.collection<MaintenanceDocument>(prefix + "site_bloc_publication_locks");
        const current = await locks.findOne({ _id: "published-graph" });
        if (!current || current.token !== options.expectedToken) {
            throw new ContentConflictError("The inspected reference fence changed; inspect it again");
        }
        if (!["leased", "committing"].includes(current.phase) || !(current.expiresAt instanceof Date)) {
            throw new ContentStorageFormatError("Invalid reference fence state");
        }
        const token = randomUUIDv7();
        const claimed = await locks.replaceOne(
            { _id: current._id, token: current.token },
            {
                _id: current._id,
                token,
                phase: "committing",
                committingAt: new Date(),
                expiresAt: new Date(Date.now() + 30000),
            },
            { comment },
        );
        if (claimed.matchedCount !== 1) {
            throw new ContentConflictError("Reference fence recovery ownership changed");
        }
        try {
            const checked = await auditMongoContentReferences(db, prefix, assertHeld, options.resolveExternalReference);
            await assertMongoQuiescent(db, comment);
            await assertHeld();
            const removed = await locks.deleteOne({ _id: current._id, token, phase: "committing" }, { comment });
            if (removed.deletedCount !== 1) {
                throw new ContentConflictError("Recovered reference fence ownership changed");
            }
            return { recovered: true, checked };
        } catch (cause) {
            throw new ContentStorageFormatError(
                `Reference recovery refused; fence remains held as ${token}. ${cause instanceof Error ? cause.message : "Audit failed"}`,
            );
        }
    });
}
