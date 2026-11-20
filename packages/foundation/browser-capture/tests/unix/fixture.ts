import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CaptureEngine, CaptureResult } from "../../src/index";
import { startUnixCaptureWorker } from "../../src/unix/server";

export const document = {
    path: "index.html",
    files: new Map([["index.html", new Blob(["private"], { type: "text/html" })]]),
};
export const options = { width: 64, height: 32, mode: "viewport" as const, themeMode: "light" as const };
export function result(): CaptureResult {
    const bytes = Buffer.alloc(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.writeUInt32BE(64, 16);
    bytes.writeUInt32BE(32, 20);
    return { bytes, width: 64, height: 32, browserVersion: "test", diagnostics: [] };
}
export async function fixture(engine: CaptureEngine = { capture: async () => result() }) {
    const root = await mkdtemp(join(tmpdir(), "ulvia-unix-"));
    const socket = join(root, "worker.sock");
    try {
        const server = await startUnixCaptureWorker(socket, engine);
        return {
            root,
            socket,
            server,
            request: (body: unknown, headers: Record<string, string> = {}) =>
                fetch("http://capture.local/v1/capture", {
                    unix: socket,
                    method: "POST",
                    headers: { "content-type": "application/json", ...headers },
                    body: JSON.stringify(body),
                }),
            close: async () => {
                await server.stop();
                await rm(root, { recursive: true, force: true });
            },
        };
    } catch (cause) {
        await rm(root, { recursive: true, force: true });
        throw cause;
    }
}
