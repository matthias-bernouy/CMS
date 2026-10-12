import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { runCli } from "../../src/cli";
import { runKernelSmoke, verifyKernelStateAfterRestart } from "./kernelSmokeFlows";

const smoke = process.env.ULVIA_RUN_KERNEL_SMOKE === "1" ? test : test.skip;
const PORTS = { kernel: 15_100, mongo: 27_029, repository: 15_102 } as const;

smoke(
    "fresh local installation publishes a Page and preserves Kernel state",
    async () => {
        const data = await mkdtemp(join(tmpdir(), "ulvia-kernel-smoke-"));
        const environment = {
            ...process.env,
            ULVIA_DATA_DIR: data,
            ULVIA_DEV_KERNEL_PORT: String(PORTS.kernel),
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
            await waitForHttp(`http://127.0.0.1:${PORTS.kernel}/login`, runtime);
            const credentials = JSON.parse(await readFile(join(data, "dev", "runtime.json"), "utf8")) as {
                adminEmail: string;
                adminPassword: string;
            };
            browser = await chromium.launch({ headless: true });
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            page.setDefaultTimeout(15_000);
            const browserErrors: string[] = [];
            page.on("pageerror", (error) => browserErrors.push(error.message));

            await runKernelSmoke(page, credentials, `http://127.0.0.1:${PORTS.kernel}`);
            await verifySecondInstanceIsolation(data, credentials, `http://127.0.0.1:${PORTS.kernel}`);

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
            await waitForHttp(`http://127.0.0.1:${PORTS.kernel}/login`, runtime);
            browser = await chromium.launch({ headless: true });
            const restartedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            restartedPage.setDefaultTimeout(15_000);
            const restartErrors: string[] = [];
            restartedPage.on("pageerror", (error) => restartErrors.push(error.message));

            await verifyKernelStateAfterRestart(restartedPage, credentials, `http://127.0.0.1:${PORTS.kernel}`);
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
    throw new Error("Local Kernel did not become ready");
}

async function verifySecondInstanceIsolation(
    dataRoot: string,
    credentials: { adminPassword: string },
    kernelUrl: string,
): Promise<void> {
    const [operatorToken, primary] = await Promise.all([
        readFile(join(dataRoot, "dev", "provider-operator-token"), "utf8"),
        readFile(join(dataRoot, "dev", "instance.json"), "utf8").then(
            (source) => JSON.parse(source) as { instanceId: string; token: string },
        ),
    ]);
    const providerUrl = "http://127.0.0.1:5103";
    const created = await fetch(`${providerUrl}/ulvia/operator/instances`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
            "idempotency-key": "kernel-smoke-second",
        },
        body: JSON.stringify({
            label: "Second isolated instance",
            kernelUrl,
            administrator: { email: "second@ulvia.local", password: credentials.adminPassword },
        }),
    });
    expect(created.status).toBe(201);
    const secondary = (await created.json()) as { instance: { id: string }; credentials: { token: string } };
    expect(secondary.instance.id).not.toBe(primary.instanceId);

    const reports = await Promise.all(
        [primary.token, secondary.credentials.token].map((token) =>
            fetch(`${providerUrl}/ulvia/report`, { headers: { authorization: `Bearer ${token}` } }).then((response) =>
                response.json(),
            ),
        ),
    );
    expect(reports.map((report) => report.instanceId)).toEqual([primary.instanceId, secondary.instance.id]);
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
