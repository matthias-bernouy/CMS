import { createRequire } from "node:module";
import { dirname, join, isAbsolute } from "node:path";
import { startUnixCaptureWorker } from "@bernouy/browser-capture/unix/server";
import { nativeCaptureEngine } from "./engine";
import { runCommand } from "../runtime/process";

const USAGE =
    "Usage: ulvia capture-worker --socket <absolute-path> [--browser-path <absolute-path>] | --install-browser";

/** Runs independently of CMS paths, configuration, PATs and installation locks. */
export async function captureWorkerCommand(args: readonly string[], log: (message: string) => void) {
    if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        log(USAGE);
        return;
    }
    if (process.getuid?.() === 0) {
        throw new Error("Run the capture worker as a dedicated unprivileged user");
    }
    if (args.length === 1 && args[0] === "--install-browser") {
        const manifest = createRequire(import.meta.url).resolve("playwright/package.json");
        await runCommand([process.execPath, join(dirname(manifest), "cli.js"), "install", "chromium"], {
            inherit: true,
        });
        return;
    }
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]!;
        const value = args[index + 1];
        if (!["--socket", "--browser-path"].includes(key) || !value || !isAbsolute(value) || values.has(key)) {
            throw new Error(USAGE);
        }
        values.set(key, value);
    }
    const socket = values.get("--socket");
    if (!socket) {
        throw new Error(USAGE);
    }
    const engine = nativeCaptureEngine(values.get("--browser-path"));
    await engine.capture(
        {
            path: "index.html",
            files: new Map([
                ["index.html", new Blob(["<!doctype html><title>Capture readiness</title>"], { type: "text/html" })],
            ]),
        },
        { width: 1, height: 1, mode: "viewport", themeMode: "light" },
    );
    const worker = await startUnixCaptureWorker(socket, engine);
    log(`Capture worker ready: ${socket}`);
    let release!: () => void;
    const stopped = new Promise<void>((resolve) => {
        release = resolve;
    });
    const stop = () => release();
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    try {
        await stopped;
    } finally {
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
        await worker.stop();
    }
}
