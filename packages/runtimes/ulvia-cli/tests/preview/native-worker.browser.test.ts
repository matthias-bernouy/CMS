import { expect, test } from "bun:test";
import { mkdtemp, rm, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createUnixCaptureClient } from "@bernouy/browser-capture/unix/client";

test.skipIf(process.env.ULVIA_RUN_CAPTURE_BROWSER !== "1")(
    "native CLI worker starts independently of CMS state, captures privately and shuts down cleanly",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-native-"));
        const socket = join(root, "worker.sock");
        const cms = join(root, "cms-must-not-exist");
        const child = Bun.spawn(
            [
                process.execPath,
                "--no-macros",
                "run",
                resolve(import.meta.dir, "../../src/index.ts"),
                "capture-worker",
                "--socket",
                socket,
                "--browser-path",
                chromium.executablePath(),
            ],
            {
                env: { PATH: process.env.PATH, HOME: process.env.HOME, ULVIA_DATA_DIR: cms },
                stdout: "pipe",
                stderr: "pipe",
            },
        );
        const stderr = new Response(child.stderr).text();
        const stdout = new Response(child.stdout).text();
        try {
            let ready = false;
            const until = Date.now() + 15_000;
            while (Date.now() < until && !ready) {
                try {
                    const response = await fetch("http://capture.local/readyz", {
                        unix: socket,
                        signal: AbortSignal.timeout(1000),
                    });
                    ready = response.status === 204;
                    await response.body?.cancel();
                } catch {
                    await Bun.sleep(50);
                }
            }
            expect(ready).toBeTrue();
            expect(await Bun.file(join(cms, "services/installation.json")).exists()).toBeFalse();
            expect(await lstat(cms).catch(() => null)).toBeNull();
            const image = await createUnixCaptureClient(socket).capture(
                {
                    path: "index.html",
                    files: new Map([
                        ["index.html", new Blob(['<p style="color:red">Native worker</p>'], { type: "text/html" })],
                    ]),
                },
                { width: 320, height: 180, mode: "viewport", themeMode: "light" },
            );
            expect([image.width, image.height]).toEqual([320, 180]);
            expect(image.bytes.byteLength).toBeGreaterThan(24);
            child.kill("SIGTERM");
            expect(await child.exited).toBe(0);
            expect(await stderr).toBe("");
            expect(await stdout).toContain("Capture worker ready");
            expect(await Bun.file(socket).exists()).toBeFalse();
        } finally {
            child.kill("SIGKILL");
            await child.exited;
            await rm(root, { recursive: true, force: true });
        }
    },
    30_000,
);
