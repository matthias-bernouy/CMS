import { randomUUIDv7 } from "bun";
import type { Db, Document } from "mongodb";
import { ContentConflictError, ContentValidationError } from "content/application/core/validation/errors";

export type MaintenanceOptions = { writersStopped: true; collectionPrefix?: string };
export type MaintenanceContext = { prefix: string; comment: string; token: string; assertHeld(): Promise<void> };

export async function assertMongoQuiescent(db: Db, comment: string): Promise<void> {
    const rows = await db.client
        .db("admin")
        .aggregate(
            [
                { $currentOp: { allUsers: true, idleConnections: false } },
                {
                    $match: {
                        $or: [
                            { "command.$db": db.databaseName },
                            { ns: { $regex: `^${db.databaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.` } },
                            { "command.commitTransaction": { $exists: true } },
                        ],
                    },
                },
                {
                    $match: {
                        "command.comment": { $ne: comment },
                        $or: [
                            { op: { $in: ["insert", "update", "remove"] } },
                            ...[
                                "insert",
                                "update",
                                "delete",
                                "findAndModify",
                                "bulkWrite",
                                "aggregate",
                                "commitTransaction",
                            ].map((key) => ({ [`command.${key}`]: { $exists: true } })),
                        ],
                    },
                },
                { $limit: 1 },
                { $project: { opid: 1 } },
            ],
            { maxTimeMS: 1000, comment },
        )
        .toArray();
    if (rows.length) {
        throw new ContentConflictError(
            "Active Mongo writes exist; stop writers and let their commands settle before maintenance",
        );
    }
}

export async function withOfflineMaintenance<T>(
    db: Db,
    options: MaintenanceOptions,
    operation: (context: MaintenanceContext) => Promise<T>,
    initialize = false,
): Promise<T> {
    if (options.writersStopped !== true) {
        throw new ContentValidationError("writersStopped", "explicit offline acknowledgement is required");
    }
    const prefix = options.collectionPrefix ?? "";
    if (typeof prefix !== "string" || prefix.length > 120 || !/^[\w.-]*$/.test(prefix)) {
        throw new ContentValidationError("collectionPrefix", "a bounded literal collection prefix is required");
    }
    const token = randomUUIDv7();
    const comment = `ulvia-content-maintenance:${token}`;
    await assertMongoQuiescent(db, comment);
    const metadata = db.collection<Document & { _id: string }>(prefix + "content_metadata");
    const id = "bloc-references";
    const current = await metadata.findOne({ _id: id });
    if (!current && !initialize) {
        throw new ContentValidationError("format", "upgrade Bloc reference storage first");
    }
    if (current && ![0, 1].includes(current.version)) {
        throw new TypeError("Unsupported Content reference format");
    }
    const maintenance = { token, expiresAt: new Date(Date.now() + 30000) };
    if (!current) {
        try {
            await metadata.insertOne({ _id: id, version: 0, maintenance }, { comment });
        } catch (error) {
            if (error && typeof error === "object" && Reflect.get(error, "code") === 11000) {
                throw new ContentConflictError("Another Content maintenance operation owns this instance");
            }
            throw error;
        }
    } else {
        if (current.maintenance) {
            if (typeof current.maintenance.token !== "string" || !(current.maintenance.expiresAt instanceof Date)) {
                throw new TypeError("Invalid persisted Content maintenance lease");
            }
            if (current.maintenance.expiresAt.getTime() > Date.now()) {
                throw new ContentConflictError("Another Content maintenance operation owns this instance");
            }
        }
        const filter = {
            _id: id,
            ...(current.maintenance
                ? {
                      "maintenance.token": current.maintenance.token,
                      "maintenance.expiresAt": current.maintenance.expiresAt,
                  }
                : { maintenance: { $exists: false } }),
        };
        const claimed = await metadata.replaceOne(filter, { ...current, maintenance }, { comment });
        if (claimed.matchedCount !== 1) {
            throw new ContentConflictError("Content maintenance ownership changed");
        }
    }
    let lost: unknown;
    const assertHeld = async () => {
        if (lost) {
            throw lost;
        }
        try {
            const result = await metadata.updateOne(
                { _id: id, "maintenance.token": token },
                { $set: { "maintenance.expiresAt": new Date(Date.now() + 30000) } },
                { comment },
            );
            if (result.matchedCount !== 1) {
                throw new ContentConflictError("Content maintenance lease was lost");
            }
        } catch (error) {
            lost = error;
            throw error;
        }
    };
    const heartbeat = setInterval(() => {
        void assertHeld().catch(() => {});
    }, 5000);
    try {
        return await operation({ prefix, comment, token, assertHeld });
    } finally {
        clearInterval(heartbeat);
        await metadata.updateOne(
            { _id: id, "maintenance.token": token },
            { $set: {}, $unset: { maintenance: "" } },
            { comment },
        );
    }
}
