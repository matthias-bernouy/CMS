import { chromium } from "playwright";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createIsolatedCaptureEngine } from "@bernouy/browser-capture/playwright";

declare const __ULVIA_CAPTURE_WORKER_BUNDLED__: boolean | undefined;

export function nativeCaptureEngine(browserPath = chromium.executablePath()) {
    const bundled = typeof __ULVIA_CAPTURE_WORKER_BUNDLED__ === "boolean" && __ULVIA_CAPTURE_WORKER_BUNDLED__;
    return createIsolatedCaptureEngine({
        bunPath: process.execPath,
        browserPath,
        modulesPath: bundled
            ? resolve(import.meta.dir, "../node_modules")
            : fileURLToPath(new URL("../../../../../node_modules", import.meta.url)),
        ...(bundled ? { workerDirectory: resolve(import.meta.dir, "capture-worker"), workerEntry: "worker.js" } : {}),
        sandboxPath: "/usr/bin/bwrap",
    });
}
