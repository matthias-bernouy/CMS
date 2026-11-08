import { parentPort } from "node:worker_threads";
import { CollectionValidationError, CollectionPublicationError } from "@bernouy/repository/collections";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import type { VerificationRequest, VerificationReply } from "./protocol";

if (!parentPort) {
    throw new Error("Collection verification requires a worker port");
}
parentPort.on("message", async ({ id, task }: VerificationRequest) => {
    const reply: VerificationReply = { id };
    try {
        if (task.kind === "json") {
            reply.value = await inlineCollectionVerifier.metadataJson(task.value, task.digest, undefined, task.limits);
        } else if (task.kind === "metadata") {
            reply.value = await inlineCollectionVerifier.metadata(task.value, task.digest, undefined, task.limits);
        } else if (task.kind === "artifact") {
            const { assets: _, ...metadata } = await inlineCollectionVerifier.artifact(
                task.value,
                task.assets,
                task.digest,
                undefined,
                task.limits,
            );
            reply.value = metadata;
        } else {
            await inlineCollectionVerifier.evolution(task.previous, task.next);
        }
    } catch (error) {
        reply.error = {
            message: error instanceof Error ? error.message.slice(0, 4096) : "Collection verification failed",
            ...(error instanceof CollectionValidationError ? { code: error.code, path: error.path } : {}),
            ...(error instanceof CollectionPublicationError
                ? { publicationCode: error.publicationCode, publicationResource: error.publicationResource }
                : {}),
        };
    }
    parentPort!.postMessage(reply);
});
parentPort.postMessage({ id: 0 });
