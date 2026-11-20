import { captureWorker } from "./capture";
import { CaptureError, CAPTURE_LIMITS } from "../core/limits";
import type { WorkerInput } from "./protocol";
try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of Bun.stdin.stream()) {
        size += chunk.byteLength;
        if (size > CAPTURE_LIMITS.inputBytes * 2) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as WorkerInput;
    await Bun.write(Bun.stdout, JSON.stringify({ output: await captureWorker(input) }));
} catch (error) {
    await Bun.write(Bun.stdout, JSON.stringify({ error: error instanceof CaptureError ? error.code : "FAILED" }));
    process.exitCode = 1;
}
