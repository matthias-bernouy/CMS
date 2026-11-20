import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import type { CaptureEngine } from "../interfaces/CaptureEngine";
import type { WorkerInput, WorkerOutput } from "./protocol";
import { CAPTURE_LIMITS, CaptureError, validateCapture } from "../core/limits";

export interface IsolatedCaptureConfiguration {
    readonly bunPath: string;
    readonly browserPath: string;
    readonly modulesPath: string;
    readonly sandboxPath: string;
    readonly workerDirectory?: string;
    readonly workerEntry?: string;
}

/** Linux namespace isolation is mandatory. No environment, home or network is inherited. */
export function createIsolatedCaptureEngine(config: IsolatedCaptureConfiguration): CaptureEngine {
    let active = 0;
    return {
        async capture(document, options, signal) {
            validateCapture(document, options);
            signal?.throwIfAborted();
            if (active >= CAPTURE_LIMITS.concurrent) {
                throw new CaptureError("BUSY");
            }
            active++;
            let child;
            let timer;
            let abort: (() => void) | undefined;
            try {
                if (![config.bunPath, config.browserPath, config.modulesPath, config.sandboxPath].every(existsSync)) {
                    throw new CaptureError("UNAVAILABLE");
                }
                const source = config.workerDirectory ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
                const browser = realpathSync(config.browserPath);
                const module = relative(
                    realpathSync(config.modulesPath),
                    realpathSync(fileURLToPath(import.meta.resolve("playwright"))),
                );
                if (module.startsWith("..") || module.startsWith("/")) {
                    throw new CaptureError("UNAVAILABLE");
                }
                const args = [
                    "--unshare-all",
                    "--die-with-parent",
                    "--new-session",
                    "--clearenv",
                    "--ro-bind",
                    "/usr",
                    "/usr",
                    "--symlink",
                    "usr/bin",
                    "/bin",
                    "--symlink",
                    "usr/lib",
                    "/lib",
                    "--symlink",
                    "usr/lib64",
                    "/lib64",
                    "--proc",
                    "/proc",
                    "--dev",
                    "/dev",
                    "--tmpfs",
                    "/tmp",
                    "--ro-bind",
                    realpathSync(config.bunPath),
                    "/bun",
                    "--ro-bind",
                    realpathSync(config.modulesPath),
                    "/node_modules",
                    "--ro-bind",
                    source,
                    "/engine",
                    "--ro-bind",
                    dirname(browser),
                    "/browser",
                    ...(existsSync("/etc/fonts") ? ["--ro-bind", "/etc/fonts", "/etc/fonts"] : []),
                    "--setenv",
                    "HOME",
                    "/tmp",
                    "--setenv",
                    "PATH",
                    "/usr/bin:/bin",
                    "--chdir",
                    "/engine",
                    "/bun",
                    "--no-macros",
                    "run",
                    `/engine/${config.workerEntry ?? "playwright/worker.ts"}`,
                ];
                child = Bun.spawn([config.sandboxPath, ...args], {
                    stdin: "pipe",
                    stdout: "pipe",
                    stderr: "ignore",
                    env: {},
                });
                const process = child;
                abort = () => process.kill("SIGKILL");
                timer = setTimeout(abort, CAPTURE_LIMITS.timeoutMs);
                signal?.addEventListener("abort", abort, { once: true });
                const input: WorkerInput = {
                    origin: document.origin ?? "https://capture.invalid",
                    path: document.path,
                    playwrightModule: `/node_modules/${module}`,
                    options,
                    executablePath: `/browser/${browser.slice(browser.lastIndexOf("/") + 1)}`,
                    files: await Promise.all(
                        [...document.files].map(async ([path, blob]) => ({
                            path,
                            mediaType: blob.type,
                            base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
                        })),
                    ),
                };
                const outputPromise = boundedOutput(process.stdout);
                process.stdin.write(JSON.stringify(input));
                await process.stdin.end();
                const [output, code] = await Promise.all([outputPromise, process.exited]);
                signal?.throwIfAborted();
                if (!output) {
                    throw new CaptureError("UNAVAILABLE");
                }
                const result = JSON.parse(output) as { output?: WorkerOutput; error?: CaptureError["code"] };
                if (result.error || code !== 0 || !result.output) {
                    throw new CaptureError(result.error ?? "FAILED");
                }
                const value = result.output;
                const bytes = new Uint8Array(Buffer.from(value.base64, "base64"));
                if (bytes.byteLength > CAPTURE_LIMITS.imageBytes) {
                    throw new CaptureError("LIMIT_EXCEEDED");
                }
                return {
                    bytes,
                    width: value.width,
                    height: value.height,
                    browserVersion: value.browserVersion,
                    diagnostics: value.diagnostics,
                };
            } finally {
                clearTimeout(timer);
                if (abort) {
                    signal?.removeEventListener("abort", abort);
                }
                child?.kill("SIGKILL");
                await child?.exited;
                active--;
            }
        },
    };
}
async function boundedOutput(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const item = await reader.read();
            if (item.done) {
                break;
            }
            size += item.value.byteLength;
            if (size > CAPTURE_LIMITS.imageBytes * 2) {
                await reader.cancel();
                throw new CaptureError("LIMIT_EXCEEDED");
            }
            chunks.push(item.value);
        }
        return Buffer.concat(chunks).toString("utf8");
    } finally {
        reader.releaseLock();
    }
}
