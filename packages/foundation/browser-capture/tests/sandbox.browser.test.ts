import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createIsolatedCaptureEngine } from "../src/playwright/engine";

test.skipIf(process.env.ULVIA_RUN_CAPTURE_BROWSER !== "1")(
    "OS isolation withholds host files, environment and loopback from executable worker code",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-worker-boundary-"));
        const host = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("host-only") });
        const previous = process.env.ULVIA_CAPTURE_TEST_SECRET;
        process.env.ULVIA_CAPTURE_TEST_SECRET = "host-only";
        try {
            const workerDirectory = join(root, "worker");
            await mkdir(workerDirectory);
            const secretPath = join(root, "host-secret.txt");
            await Bun.write(secretPath, "host-only");
            await Bun.write(
                join(workerDirectory, "probe.js"),
                `await Bun.stdin.text();
                const hostFile = await Bun.file(${JSON.stringify(secretPath)}).exists();
                const hostEnvironment = process.env.ULVIA_CAPTURE_TEST_SECRET !== undefined;
                let hostNetwork = false;
                try { await fetch(${JSON.stringify(host.url.href)}, {signal: AbortSignal.timeout(1000)}); hostNetwork = true; } catch {}
                process.stdout.write(JSON.stringify({output: {
                    base64: Buffer.alloc(24).toString("base64"), width: 1, height: 1,
                    browserVersion: "probe", diagnostics: [JSON.stringify({hostFile, hostEnvironment, hostNetwork})]
                }}));`,
            );
            const engine = createIsolatedCaptureEngine({
                bunPath: process.execPath,
                browserPath: chromium.executablePath(),
                modulesPath: resolve("node_modules"),
                sandboxPath: "/usr/bin/bwrap",
                workerDirectory,
                workerEntry: "probe.js",
            });
            const result = await engine.capture(
                { path: "index.html", files: new Map([["index.html", new Blob(["test"])]]) },
                { width: 1, height: 1, mode: "viewport", themeMode: "light" },
            );
            expect(JSON.parse(result.diagnostics[0]!)).toEqual({
                hostFile: false,
                hostEnvironment: false,
                hostNetwork: false,
            });
        } finally {
            if (previous === undefined) {
                delete process.env.ULVIA_CAPTURE_TEST_SECRET;
            } else {
                process.env.ULVIA_CAPTURE_TEST_SECRET = previous;
            }
            host.stop(true);
            await rm(root, { recursive: true, force: true });
        }
    },
    10_000,
);
