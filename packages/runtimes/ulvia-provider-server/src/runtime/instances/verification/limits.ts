import { CollectionValidationError } from "@bernouy/cms-repository/collections";
import type { VerificationTask, VerificationReply } from "./protocol";
import { CollectionPublicationError } from "@bernouy/cms-repository/collections";

/** Bound retained structured-clone payloads independently of queue length. */
export function taskBytes(task: VerificationTask): number {
    const values = task.kind === "evolution" ? [task.previous, task.next] : [task.value];
    let bytes = 0;
    for (const value of values) {
        const json = JSON.stringify(value);
        if (!json || json.length > 8 * 1024 * 1024) {
            throw new CollectionValidationError("body_limit_exceeded", "verification document exceeds limit");
        }
        bytes += Buffer.byteLength(json);
    }
    if (task.kind === "artifact") {
        if (task.assets.length > 1024) {
            throw new CollectionValidationError("body_limit_exceeded", "verification asset count exceeds limit");
        }
        for (const asset of task.assets) {
            bytes += asset.bytes instanceof Blob ? asset.bytes.size : asset.bytes.byteLength;
        }
    }
    if (bytes > 64 * 1024 * 1024) {
        throw new CollectionValidationError("body_limit_exceeded", "verification payload exceeds limit");
    }
    return bytes;
}

export function verificationError(error: NonNullable<VerificationReply["error"]>): Error {
    if (error.publicationCode) {
        return Object.assign(
            new CollectionPublicationError(error.publicationCode, undefined, error.publicationResource),
            { message: error.message },
        );
    }
    if (error.code) {
        return Object.assign(new CollectionValidationError(error.code, "verification failed", error.path), {
            message: error.message,
        });
    }
    return new Error(error.message);
}
