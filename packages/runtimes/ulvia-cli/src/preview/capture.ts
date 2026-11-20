import { join } from "node:path";
import { createHash } from "node:crypto";
import type { CollectionExampleFrame } from "@bernouy/repository/collections/build";
import { nativeCaptureEngine } from "../capture-worker/engine";

export async function captureCollectionExamples(
    files: ReadonlyMap<string, Blob>,
    frames: readonly CollectionExampleFrame[],
    output: string,
): Promise<readonly { path: string; browserVersion: string; digest: string; byteLength: number }[]> {
    const engine = nativeCaptureEngine();
    const captures = [];
    for (const frame of frames) {
        const result = await engine.capture(
            { files, path: frame.path },
            { width: frame.width, height: frame.height, mode: "viewport", themeMode: frame.themeMode },
        );
        const failures = result.diagnostics.filter(
            (message) => message.startsWith("JavaScript:") || message.startsWith("Broken images:"),
        );
        if (failures.length) {
            throw new Error(`Example ${frame.path}: ${failures.join("; ")}`);
        }
        const path = frame.path.replace(/\.html$/u, ".png");
        await Bun.write(join(output, path), new Uint8Array(result.bytes));
        captures.push({
            path,
            browserVersion: result.browserVersion,
            digest: `sha256:${createHash("sha256").update(result.bytes).digest("hex")}`,
            byteLength: result.bytes.byteLength,
        });
    }
    return captures;
}
