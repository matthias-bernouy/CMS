import type { EmbeddingWorkerReply, EmbeddingWorkerRequest } from "../../interfaces/EmbeddingWorker";
import { TransformersModel } from "./model";

let model: TransformersModel | undefined;
process.on("message", async (request: EmbeddingWorkerRequest) => {
    const reply: EmbeddingWorkerReply = { id: request.id };
    try {
        if (request.action === "initialize") {
            model ??= new TransformersModel(request.options);
            await model.initialize(new AbortController().signal);
        } else if (request.action === "close") {
            await model?.close();
        } else {
            if (!model) {
                throw new Error("Embedding model is not initialized");
            }
            reply.vectors = await model.embed(request.texts, request.kind, new AbortController().signal);
        }
    } catch (error) {
        reply.error = { name: error instanceof Error ? error.name : "Error", message: String(error) };
    }
    if (process.connected) {
        process.send!(reply);
    }
    if (request.action === "close") {
        process.disconnect!();
    }
});

// A killed parent must not leave its native model and CPU pool running as an orphan.
process.on("disconnect", () => {
    void model?.close().catch(() => {
        // There is no IPC peer left; retain cleanup failures in the process exit status.
        process.exitCode = 1;
    });
});
