import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { ProcessVerificationSandboxError, type ProcessVerificationSandboxErrorCode } from "./types";

export async function writeChildInput(child: ChildProcessWithoutNullStreams, bytes: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        child.stdin.once("error", reject);
        child.stdin.end(Buffer.from(bytes), () => resolve());
    });
}

export async function readBoundedChildStream(
    stream: NodeJS.ReadableStream,
    limit: number,
    code: Extract<ProcessVerificationSandboxErrorCode, "output-limit" | "error-output-limit">,
): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of stream as AsyncIterable<Uint8Array | string>) {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        total += bytes.byteLength;
        if (total > limit) {
            throw new ProcessVerificationSandboxError(code);
        }
        chunks.push(bytes);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
