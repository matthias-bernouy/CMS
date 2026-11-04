import { fileURLToPath } from "node:url";
import type { EmbeddingWorkerReply } from "../../interfaces/EmbeddingWorker";

/** Native getenv must see this flag before ONNX loads; thread-local JS worker.env is insufficient. */
export function spawnModelProcess(
    receive: (reply: EmbeddingWorkerReply) => void,
    entrypoint = new URL("./worker.ts", import.meta.url),
) {
    return Bun.spawn([process.execPath, "--no-macros", fileURLToPath(entrypoint)], {
        env: { ORT_DISABLE_TELEMETRY: "1" },
        stdin: "ignore",
        stdout: "ignore",
        stderr: "inherit",
        ipc: receive,
    });
}
