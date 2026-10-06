import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { runCli } from "../../src/cli";
import { runControlSmoke, verifyControlStateAfterRestart } from "./controlSmokeFlows";

const smoke = process.env.ULVIA_RUN_CONTROL_SMOKE === "1" ? test : test.skip;
const PORTS = { control: 15_100, delivery: 15_101, mongo: 27_029, repository: 15_102 } as const;

smoke(
    "fresh local installation supports every Control workspace and one mutation per domain",
    async () => {
        const data = await mkdtemp(join(tmpdir(), "ulvia-control-smoke-"));
        const environment = {
            ...process.env,
            ULVIA_DATA_DIR: data,
            ULVIA_DEV_CONTROL_PORT: String(PORTS.control),
            ULVIA_DEV_DELIVERY_PORT: String(PORTS.delivery),
            ULVIA_DEV_MONGO_PORT: String(PORTS.mongo),
            ULVIA_DEV_REPOSITORY_PORT: String(PORTS.repository),
        };
        const cli = resolve(import.meta.dir, "../../src/index.ts");
        const smokeCollection = resolve(import.meta.dir, "fixtures/smoke-kit");
        let runtime: ReturnType<typeof Bun.spawn> | undefined;
        let output = "";
        let capture: Promise<void[]> | undefined;
        let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
        try {
            await runCli(["release", smokeCollection], { environment, log: () => undefined });
            runtime = Bun.spawn([process.execPath, cli, "dev"], {
                cwd: resolve(import.meta.dir, "../../../../.."),
                env: environment,
                stdout: "pipe",
                stderr: "pipe",
            });
            capture = Promise.all([
                captureOutput(runtime.stdout, (value) => (output += value)),
                captureOutput(runtime.stderr, (value) => (output += value)),
            ]);
            await waitForHttp(`http://127.0.0.1:${PORTS.control}/login`, runtime);
            const credentials = JSON.parse(await readFile(join(data, "dev", "runtime.json"), "utf8")) as {
                adminEmail: string;
                adminPassword: string;
            };
            browser = await chromium.launch({ headless: true });
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            page.setDefaultTimeout(15_000);
            const browserErrors: string[] = [];
            page.on("pageerror", (error) => browserErrors.push(error.message));

            await runControlSmoke(page, credentials, `http://127.0.0.1:${PORTS.control}`);

            expect(browserErrors).toEqual([]);
            await browser.close();
            browser = undefined;
            runtime.kill("SIGTERM");
            await runtime.exited;
            await capture;

            output += "\n--- persisted-state restart ---\n";
            runtime = Bun.spawn([process.execPath, cli, "dev"], {
                cwd: resolve(import.meta.dir, "../../../../.."),
                env: environment,
                stdout: "pipe",
                stderr: "pipe",
            });
            capture = Promise.all([
                captureOutput(runtime.stdout, (value) => (output += value)),
                captureOutput(runtime.stderr, (value) => (output += value)),
            ]);
            await waitForHttp(`http://127.0.0.1:${PORTS.control}/login`, runtime);
            browser = await chromium.launch({ headless: true });
            const restartedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            restartedPage.setDefaultTimeout(15_000);
            const restartErrors: string[] = [];
            restartedPage.on("pageerror", (error) => restartErrors.push(error.message));

            await verifyControlStateAfterRestart(restartedPage, credentials, `http://127.0.0.1:${PORTS.control}`);
            expect(restartErrors).toEqual([]);
        } catch (error) {
            throw new Error(`${error instanceof Error ? error.message : String(error)}\n\nRuntime output:\n${output}`);
        } finally {
            await browser?.close();
            runtime?.kill("SIGTERM");
            await runtime?.exited;
            await capture;
            await runCli(["dev", "stop"], { environment, log: () => undefined }).catch(() => undefined);
            await rm(data, { recursive: true, force: true });
        }
    },
    180_000,
);

async function waitForHttp(url: string, runtime: ReturnType<typeof Bun.spawn>): Promise<void> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        if (runtime.exitCode !== null) {
            throw new Error(`Local runtime exited during startup (${runtime.exitCode})`);
        }
        const ready = await fetch(url, { redirect: "manual" }).then(
            (response) => response.status < 500,
            () => false,
        );
        if (ready) {
            return;
        }
        await Bun.sleep(250);
    }
    throw new Error("Local Control did not become ready");
}

async function captureOutput(
    stream: ReadableStream<Uint8Array> | number | null | undefined,
    append: (value: string) => void,
): Promise<void> {
    if (!stream || typeof stream === "number") {
        return;
    }
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
        append(decoder.decode(chunk, { stream: true }));
    }
    append(decoder.decode());
}
