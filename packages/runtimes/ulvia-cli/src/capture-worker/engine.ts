import { chromium } from "playwright";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createIsolatedCaptureEngine } from "@bernouy/browser-capture/playwright";
import { CaptureError } from "@bernouy/browser-capture";

declare const __ULVIA_CAPTURE_WORKER_BUNDLED__: boolean | undefined;

export function nativeCaptureEngine(browserPath = chromium.executablePath()) {
    const bundled = typeof __ULVIA_CAPTURE_WORKER_BUNDLED__ === "boolean" && __ULVIA_CAPTURE_WORKER_BUNDLED__;
    return createIsolatedCaptureEngine({
        bunPath: process.execPath,
        browserPath,
        modulesPath: playwrightModulesDirectory(import.meta.resolve("playwright")),
        ...(bundled ? { workerDirectory: resolve(import.meta.dir, "capture-worker"), workerEntry: "worker.js" } : {}),
        sandboxPath: "/usr/bin/bwrap",
    });
}

/** Keep hoisted dependencies and Bun's linked package store inside the same read-only mount. */
export function playwrightModulesDirectory(moduleUrl: string): string {
    const modulePath = fileURLToPath(moduleUrl);
    const boundary = modulePath.indexOf(`${sep}node_modules${sep}`);
    if (boundary === -1) {
        throw new CaptureError("UNAVAILABLE");
    }
    return modulePath.slice(0, boundary + `${sep}node_modules`.length);
}
