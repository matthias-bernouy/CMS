import { lstat, chmod, unlink } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import type { CaptureEngine } from "../interfaces/CaptureEngine";
import { CaptureBudget } from "../core/CaptureBudget";
import { CaptureError, CAPTURE_LIMITS } from "../core/limits";
import { readJson, JOB_BYTES } from "./body";
import { decodeDocument } from "./protocol";
import { captureSocketLease } from "./lease";

export async function startUnixCaptureWorker(socketPath: string, engine: CaptureEngine) {
    if (!isAbsolute(socketPath) || Buffer.byteLength(socketPath) > 100) {
        throw new Error("Capture socket must be an absolute Unix path of at most 100 bytes");
    }
    const parent = await lstat(dirname(socketPath));
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o007) !== 0) {
        throw new Error("Capture socket requires a real directory inaccessible to other users");
    }
    const budget = new CaptureBudget();
    const jobs = new Set<Promise<Response>>();
    const stopping = new AbortController();
    const lease = await captureSocketLease(socketPath);
    let server;
    try {
        server = Bun.serve({
            unix: socketPath,
            maxRequestBodySize: JOB_BYTES,
            async fetch(request) {
                if (request.headers.has("origin")) {
                    await request.body?.cancel();
                    return new Response(null, { status: 403 });
                }
                if (request.method === "GET" && new URL(request.url).pathname === "/readyz") {
                    return new Response(null, { status: 204 });
                }
                if (
                    request.method !== "POST" ||
                    new URL(request.url).pathname !== "/v1/capture" ||
                    request.headers.get("content-type") !== "application/json"
                ) {
                    await request.body?.cancel();
                    return new Response(null, { status: 404 });
                }
                try {
                    const job = budget.run(async () => {
                        const signal = AbortSignal.any([
                            request.signal,
                            stopping.signal,
                            AbortSignal.timeout(CAPTURE_LIMITS.timeoutMs + 3000),
                        ]);
                        const job = decodeDocument(await readJson(request.body, JOB_BYTES, signal));
                        const result = await engine.capture(job.document, job.options, signal);
                        return Response.json(
                            {
                                ...result,
                                bytes: undefined,
                                base64: Buffer.from(result.bytes).toString("base64"),
                            },
                            { headers: { "cache-control": "no-store" } },
                        );
                    });
                    jobs.add(job);
                    try {
                        return await job;
                    } finally {
                        jobs.delete(job);
                    }
                } catch (cause) {
                    await request.body?.cancel().catch(() => undefined);
                    const error = cause instanceof CaptureError ? cause.code : "FAILED";
                    return Response.json(
                        { error },
                        { status: ["INVALID_INPUT", "LIMIT_EXCEEDED"].includes(error) ? 400 : 503 },
                    );
                }
            },
        });
        await chmod(socketPath, 0o660);
        if ((await lstat(socketPath)).gid !== parent.gid) {
            throw new Error("Run the capture worker with the socket directory's shared group");
        }
    } catch (cause) {
        await server?.stop(true);
        lease.release();
        throw cause;
    }
    const identity = await lstat(socketPath);
    let closed = false;
    return {
        async stop() {
            if (closed) {
                return;
            }
            closed = true;
            try {
                stopping.abort();
                await server.stop(true);
                await Promise.allSettled([...jobs]);
                const current = await lstat(socketPath).catch(() => undefined);
                if (current?.ino === identity.ino && current.dev === identity.dev) {
                    await unlink(socketPath);
                }
            } finally {
                lease.release();
            }
        },
    };
}
