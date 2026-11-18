import { randomUUIDv7 } from "bun";
import { BSON, MongoInvalidArgumentError } from "mongodb";
import type { Collection, Db, Document } from "mongodb";
import type { SiteBlocPublicationLockDoc } from "content/application/default-implementation/mongo/repositories/documents";
import { ContentValidationError } from "content/application/core/validation/errors";
import { beginMongoReferenceMutation } from "../commit";
import { samePublicationScope } from "../state";
import { referenceWrites, uncertainReferenceWrite } from "./outcomes";
import { observeReferenceCommand } from "./commands";

const writes: Readonly<Record<string, number>> = {
    insertOne: 1,
    insertMany: 1,
    updateOne: 2,
    updateMany: 2,
    replaceOne: 2,
    deleteOne: 1,
    deleteMany: 1,
    findOneAndUpdate: 2,
    findOneAndReplace: 2,
    findOneAndDelete: 1,
    bulkWrite: 1,
};
const reads = new Set(["find", "findOne", "countDocuments", "estimatedDocumentCount", "distinct", "watch"]);

export function referenceWriteCollection<T extends Document>(
    db: Db,
    locks: Collection<SiteBlocPublicationLockDoc>,
    collection: Collection<T>,
): Collection<T> {
    return new Proxy(collection, {
        get(target, key) {
            const value = Reflect.get(target, key, target);
            if (typeof value !== "function") {
                return value;
            }
            return (...args: unknown[]) => {
                const context = referenceWrites.getStore();
                if (!context || !samePublicationScope(context, { db, locks })) {
                    return value.apply(target, args);
                }
                const name = String(key);
                if (reads.has(name)) {
                    return value.apply(target, args);
                }
                if (
                    name === "aggregate" &&
                    Array.isArray(args[0]) &&
                    !args[0].some(
                        (stage) => stage && typeof stage === "object" && ("$merge" in stage || "$out" in stage),
                    )
                ) {
                    return value.apply(target, args);
                }
                if (!Object.hasOwn(writes, name)) {
                    throw new ContentValidationError(
                        "storage.operation",
                        `Unsupported reference storage operation: ${name}`,
                    );
                }
                return mutate();

                async function mutate() {
                    const comment = `ulvia-content:${randomUUIDv7()}`;
                    const observed = observeReferenceCommand(db.client, comment);
                    try {
                        await beginMongoReferenceMutation(context!.db, context!.guard);
                        const options = writes[name]!;
                        args[options] = { ...(args[options] as object | undefined), comment };
                        try {
                            return await value.apply(target, args);
                        } catch (error) {
                            if ((observed.known && !observed.sent) || definitiveRefusal(error, name)) {
                                throw error;
                            }
                            throw uncertainReferenceWrite(error);
                        }
                    } finally {
                        observed.close();
                    }
                }
            };
        },
    });
}

function definitiveRefusal(error: unknown, method: string): boolean {
    if (error instanceof MongoInvalidArgumentError || error instanceof BSON.BSONError) {
        return true;
    }
    return (
        [
            "insertOne",
            "updateOne",
            "replaceOne",
            "deleteOne",
            "findOneAndUpdate",
            "findOneAndReplace",
            "findOneAndDelete",
        ].includes(method) &&
        !!error &&
        typeof error === "object" &&
        !Reflect.get(error, "writeConcernError") &&
        [2, 121, 10334, 11000].includes(Number(Reflect.get(error, "code")))
    );
}
