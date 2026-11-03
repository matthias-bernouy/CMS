import { parentPort, workerData } from "node:worker_threads";
import type {
    EmbeddingModelOptions,
    EmbeddingWorkerReply,
    EmbeddingWorkerRequest,
} from "../../interfaces/EmbeddingWorker";
import { TransformersModel } from "./model";

const model = new TransformersModel(workerData as EmbeddingModelOptions);
parentPort!.on("message", async (request: EmbeddingWorkerRequest) => {
    const reply: EmbeddingWorkerReply = { id: request.id };
    try {
        if (request.action === "close") {
            await model.close();
        } else if (request.action === "initialize") {
            await model.initialize(new AbortController().signal);
        } else {
            reply.vectors = await model.embed(request.texts, request.kind, new AbortController().signal);
        }
    } catch (error) {
        reply.error = { name: error instanceof Error ? error.name : "Error", message: String(error) };
    }
    parentPort!.postMessage(reply);
    if (request.action === "close") {
        parentPort!.close();
    }
});
