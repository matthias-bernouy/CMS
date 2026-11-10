import { publishSmokeRepository } from "./fixtures/repositoryBootstrap";
import { captureCapabilityFailures } from "./fixtures/browserDiagnostics";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
import { initializeSmokeRegistry, prepareHostedSites, siteCredentials } from "./edgeSmoke/hosting";
import { assertEmptySite } from "./edgeSmoke/setup";
import { verifyPublishedAcrossEdges } from "./edgeSmoke/lifecycle";
import { assertPortAvailable, writeFailureArtifacts } from "./edgeSmoke/diagnostics";

const smoke = process.env.ULVIA_RUN_EDGE_SMOKE === "1" ? test : test.skip;
const PORTS = { edge: 15_100, registryBridge: 15_102, provider: 15_103 } as const;

smoke(
    "fresh shared hosting configures empty Control, publishes an isolated site and preserves it across restart and two Edges",
    async () => {
        assertPortAvailable(PORTS.edge, "shared proxy");
        assertPortAvailable(PORTS.registryBridge, "test Registry ingress");
        assertPortAvailable(PORTS.provider, "official Provider");
        const data = await mkdtemp(join(tmpdir(), "ulvia-edge-smoke-"));
        const environment = {
            ...process.env,
            ULVIA_DATA_DIR: data,
            ULVIA_CONFIG_DIR: join(data, "client"),
            ULVIA_HTTP_PORT: String(PORTS.edge),
            ULVIA_PROVIDER_PORT: String(PORTS.provider),
        };
        const smokeCollection = resolve(import.meta.dir, "fixtures/smoke-kit");
        let output = "";
        let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
        let browserErrors: string[] = [];
        let browserFailures = () => "(none)";
        const options = {
            environment,
            log: (message: string) => {
                output += `${message}\n`;
            },
        };
        try {
            console.info("[edge-smoke] prepare immutable resources and fresh shared services");
            const version = await prepareSmokeRuntimeImages(environment);
            await bootstrapOfficialRepository(join(data, "repository"));
            await runCli(["release", smokeCollection], { environment, log: () => undefined });
            for (const version of ["1.1.0", "2.0.0", "2.1.0-beta.1"]) {
                const source = await prepareSmokeCollectionRelease(smokeCollection, data, version);
                await runCli(["release", source], { environment, log: () => undefined });
            }
            await runCli(["apply", "--version", version], options);
            browser = await chromium.launch({ headless: true });
            console.info("[edge-smoke] native empty Control and two logical sites through hosting contracts");
            const { control, registry, primary } = await prepareHostedSites(browser, data, PORTS.edge);
            await initializeSmokeRegistry(browser, registry);
            await publishSmokeRepository(environment, PORTS.registryBridge);
            const page = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
            page.setDefaultTimeout(15_000);
            browserFailures = captureCapabilityFailures(page);
            page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));
            console.info("[edge-smoke] explicit collection publication and Page isolation");
            await runEdgeSmoke(page, siteCredentials(primary), primary.origin, registry.origin);
            await verifySecondInstanceIsolation(primary, registry);
            await assertEmptySite(control);
            expect(browserErrors).toEqual([]);
            await browser.close();
            browser = undefined;
            const status: string[] = [];
            await runCli(["status"], { environment, log: (message) => status.push(message) });
            expect(status).toContain("Installation: running");
            expect(status.some((line) => line.startsWith("edge-1: running / healthy"))).toBe(true);
            expect(status.some((line) => line.startsWith("edge-2:"))).toBe(false);
            await runCli(["stop"], options);
            const stopped: string[] = [];
            await runCli(["status"], { environment, log: (message) => stopped.push(message) });
            expect(stopped).toContain("Installation: stopped");
            console.info("[edge-smoke] persisted-state restart");
            await runCli(["start"], options);
            browser = await chromium.launch({ headless: true });
            const restartedPage = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
            browserFailures = captureCapabilityFailures(restartedPage);
            browserErrors = [];
            restartedPage.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));
            await verifyEdgeStateAfterRestart(restartedPage, siteCredentials(primary), primary.origin);
            await assertEmptySite(control);
            await assertEmptySite(registry);
            console.info("[edge-smoke] two warmed Edge processes and content invalidation");
            await runCli(["configure", "--edges", "2"], options);
            await runCli(["apply"], options);
            await verifyPublishedAcrossEdges(environment, primary, control);
            expect(browserErrors).toEqual([]);
        } catch (cause) {
            for (const service of ["mongo-provision", "provider", "edge-1", "proxy"]) {
                await runCli(["logs", "--filter", `service=${service}`], options).catch(() => undefined);
            }
            output += `\nCapability HTTP failures:\n${browserFailures()}\n`;
            await writeFailureArtifacts(output, browser);
            throw new Error(
                `${cause instanceof Error ? cause.message : String(cause)}\nBrowser errors:\n${browserErrors.join("\n") || "(none)"}\nRuntime output:\n${output}`,
                { cause },
            );
        } finally {
            await browser?.close();
            await cleanupSmokeRuntime(environment);
            await rm(data, { recursive: true, force: true });
        }
    },
    900_000,
);
