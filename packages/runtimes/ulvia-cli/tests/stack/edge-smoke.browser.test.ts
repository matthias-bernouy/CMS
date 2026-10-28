import { captureCapabilityFailures } from "./fixtures/browserDiagnostics";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { runCli } from "../../src/cli";
import { bootstrapOfficialRepository } from "../../src/commands/bootstrap";
import { cleanupSmokeRuntime } from "./fixtures/runtimeCleanup";
import { prepareSmokeRuntimeImages } from "./fixtures/runtimeImages";
import { prepareSmokeCollectionRelease } from "./fixtures/collectionReleases";
import { runEdgeSmoke, verifyEdgeStateAfterRestart } from "./edgeSmoke/flows";
import { verifySecondInstanceIsolation } from "./edgeSmoke/providerAccess";

const smoke = process.env.ULVIA_RUN_EDGE_SMOKE === "1" ? test : test.skip;
const PORTS = { edge: 15_100, repository: 15_102, provider: 15_103 } as const;
const EDGE_URL = `http://localhost:${PORTS.edge}`;

smoke(
    "fresh local installation publishes a Page and preserves Edge state",
    async () => {
        assertPortAvailable(PORTS.edge, "shared proxy");
        assertPortAvailable(PORTS.repository, "official Repository");
        assertPortAvailable(PORTS.provider, "official Provider");
        const data = await mkdtemp(join(tmpdir(), "ulvia-edge-smoke-"));
        const environment = {
            ...process.env,
            ULVIA_DATA_DIR: data,
            CMS_REPOSITORY_URL: "http://repository:3000",
            CMS_REPOSITORY_ALLOW_INSECURE_HTTP: "true",
            ULVIA_CONFIG_DIR: join(data, "client"),
            ULVIA_HTTP_PORT: String(PORTS.edge),
            ULVIA_REPOSITORY_PORT: String(PORTS.repository),
            ULVIA_PROVIDER_PORT: String(PORTS.provider),
        };
        const smokeCollection = resolve(import.meta.dir, "fixtures/smoke-kit");
        let output = "";
        let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
        let browserErrors: string[] = [];
        let browserFailures = () => "(none)";
        try {
            report("prepare local runtime image pins");
            const version = await prepareSmokeRuntimeImages(environment);
            await bootstrapOfficialRepository(join(data, "repository"));
            await runCli(["release", smokeCollection], { environment, log: () => undefined });
            const compatibleUpgrade = await prepareSmokeCollectionRelease(smokeCollection, data, "1.1.0");
            const majorUpgrade = await prepareSmokeCollectionRelease(smokeCollection, data, "2.0.0");
            await runCli(["release", compatibleUpgrade], { environment, log: () => undefined });
            await runCli(["release", majorUpgrade], { environment, log: () => undefined });
            await runCli(["services", "start", "--version", version], {
                environment,
                log: (message) => (output += `${message}\n`),
            });
            await runCli(["instance", "create", "default"], {
                environment,
                log: (message) => (output += `${message}\n`),
            });
            await waitForHttp(`${EDGE_URL}/login`);
            const credentials = JSON.parse(
                await readFile(join(data, "instances", "default", "runtime.json"), "utf8"),
            ) as {
                adminEmail: string;
                adminPassword: string;
            };
            browser = await chromium.launch({ headless: true });
            const page = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
            page.setDefaultTimeout(15_000);
            browserFailures = captureCapabilityFailures(page);
            page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));

            report("initial browser journey");
            await runEdgeSmoke(page, credentials, EDGE_URL);
            const journal: string[] = [];
            await runCli(["instance", "logs", "default", "edge", "--event", "edge.started", "--json"], {
                environment,
                log: (line) => journal.push(line),
            });
            expect(journal.some((line) => JSON.parse(line).event === "edge.started")).toBe(true);
            report("second instance isolation");
            await verifySecondInstanceIsolation(data, credentials, EDGE_URL, `http://127.0.0.1:${PORTS.provider}`);

            expect(browserErrors).toEqual([]);
            await browser.close();
            browser = undefined;
            report("first runtime shutdown");
            const status: string[] = [];
            await runCli(["services", "status"], { environment, log: (message) => status.push(message) });
            await runCli(["instance", "status", "default"], { environment, log: (message) => status.push(message) });
            expect(status).toContain("Shared services: running");
            expect(status).toContain("Instance default: running");
            expect(status).toContain("Ulvia Provider: running / healthy");
            expect(status).toContain("Repository: running / healthy");
            await runCli(["instance", "stop", "default"], { environment, log: () => undefined });
            await runCli(["services", "stop"], { environment, log: () => undefined });
            const stoppedStatus: string[] = [];
            await runCli(["services", "status"], { environment, log: (message) => stoppedStatus.push(message) });
            expect(stoppedStatus).toContain("Shared services: stopped");

            output += "\n--- persisted-state restart ---\n";
            report("persisted-state restart");
            await runCli(["start"], { environment, log: (message) => (output += `${message}\n`) });
            await waitForHttp(`${EDGE_URL}/login`);
            browser = await chromium.launch({ headless: true });
            const restartedPage = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
            restartedPage.setDefaultTimeout(15_000);
            browserFailures = captureCapabilityFailures(restartedPage);
            const restartErrors: string[] = [];
            browserErrors = restartErrors;
            restartedPage.on("pageerror", (error) => restartErrors.push(error.stack ?? error.message));

            report("persisted browser journey");
            await verifyEdgeStateAfterRestart(restartedPage, credentials, EDGE_URL);
            expect(restartErrors).toEqual([]);
            await browser.close();
            browser = undefined;
            report("second runtime shutdown");
            await runCli(["instance", "stop", "default"], { environment, log: () => undefined });
            await runCli(["services", "stop"], { environment, log: () => undefined });
        } catch (error) {
            await runCli(["services", "logs", "provider"], {
                environment,
                log: (message) => (output += `${message}\n`),
            }).catch(() => undefined);
            await runCli(["instance", "logs", "default", "provider", "--level", "error", "--json", "--stack"], {
                environment,
                log: (message) => (output += `${message}\n`),
            }).catch(() => undefined);
            output += `\nCapability HTTP failures:\n${browserFailures()}\n`;
            await writeFailureArtifacts(output, browser);
            throw new Error(
                `${error instanceof Error ? error.message : String(error)}\n\nBrowser errors:\n${browserErrors.join("\n") || "(none)"}\n\nRuntime output:\n${output}`,
                { cause: error },
            );
        } finally {
            await browser?.close();
            await cleanupSmokeRuntime(environment);
            await rm(data, { recursive: true, force: true });
        }
    },
    900_000,
);

function report(step: string): void {
    console.info(`[edge-smoke] ${step}`);
}

async function waitForHttp(url: string): Promise<void> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        const ready = await fetch(url, { redirect: "manual" }).then(
            (response) => response.status < 500,
            () => false,
        );
        if (ready) {
            return;
        }
        await Bun.sleep(250);
    }
    throw new Error("Local Edge did not become ready");
}

function assertPortAvailable(port: number, label: string): void {
    try {
        const probe = Bun.serve({
            hostname: "127.0.0.1",
            port,
            fetch: () => new Response(null, { status: 204 }),
        });
        probe.stop(true);
    } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (code === "EADDRINUSE") {
            throw new Error(
                `Edge smoke cannot start because the ${label} port ${port} is already in use. Stop the existing local Ulvia installation and retry.`,
            );
        }
        throw error;
    }
}

async function writeFailureArtifacts(
    output: string,
    browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
): Promise<void> {
    const directory = resolve(process.env.ULVIA_SMOKE_ARTIFACTS_DIR ?? "artifacts/edge-smoke");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "runtime.log"), output, "utf8");
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) {
        await Promise.all([
            page
                .screenshot({ path: join(directory, "failure.png"), fullPage: true, timeout: 5_000 })
                .catch(() => undefined),
            Promise.race([
                page
                    .content()
                    .then((html) => writeFile(join(directory, "failure.html"), html, "utf8"))
                    .catch(() => undefined),
                Bun.sleep(5_000),
            ]),
        ]);
    }
}
