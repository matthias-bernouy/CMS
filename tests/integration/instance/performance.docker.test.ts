import { exerciseMutationFreshness } from "./performance/freshness/mutations";
import { exerciseFreshness } from "./performance/freshness";
import { exerciseBulkJournal } from "./observability/bulk-journal";
import { verifyPublicTrace } from "./observability/public-trace";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { networkPreloadSource } from "./performance/network-preload";
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mcpContainers } from "./containers";
import { connectBrowser } from "./oauth";
import { measureResource, publishPerformancePages, measureCached } from "./performance/journey";
import { beginSupplementary, writeSupplementary } from "../../performance/reporting/storage/supplementary";
import { exerciseLoad, assertDeliveryLoad } from "../../performance/delivery/load";
import { Cleanup } from "../../performance/harness/execution/cleanup";
import { verifyImage } from "../../performance/harness/measurements/provenance";
import { docker } from "./docker";
import { createHash } from "node:crypto";
const enabled = process.env.ULVIA_RUN_DELIVERY_PERFORMANCE === "1";
const integration = enabled ? test : test.skip;
integration(
    "public delivery stays inside work budgets and image-capable Pages sustain 200 views/minute",
    async () => {
        const images = {
            edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE,
            provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE,
        };
        if (!images.edge || !images.provider) {
            throw new Error("Delivery performance requires the candidate Edge and Provider Docker images");
        }
        const source = networkPreloadSource();
        const start = await beginSupplementary("delivery", {
            images,
            instrumentationDigest: createHash("sha256").update(source).digest("hex"),
            resourceLimits: "Docker defaults",
        });
        const cleanup = new Cleanup();
        const report: Record<string, unknown> = {};
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            report.images = await Promise.all(
                (["edge", "provider"] as const).map(async (component) =>
                    verifyImage(
                        JSON.parse((await docker(["image", "inspect", images[component]!])).stdout),
                        component,
                        images[component]!,
                        start.metadata.revision,
                    ),
                ),
            );
            const instrumentation = await mkdtemp(join(tmpdir(), "ulvia-delivery-probe-"));
            cleanup.add("delivery instrumentation", () => rm(instrumentation, { recursive: true, force: true }));
            const preload = join(instrumentation, "fetch.ts");
            await writeFile(preload, source);
            const stack = await mcpContainers(images as Record<keyof typeof images, string>, undefined, preload, false);
            cleanup.add("delivery Docker stack", stack.close);
            try {
                connection = await connectBrowser(stack.cmsUrl, stack.administrator);
                const browser = connection.browser;
                cleanup.add("delivery authentication browser", () => browser.close());
                await connection.call("ulvia/cms.authoring", "configure-connection", {
                    token: stack.repository.pat.token,
                });
                // This instrumented fixture has no Docker healthcheck traffic to warm the cache.
                await stack.restartProvider();
                await verifyPublicTrace(
                    { providerUrl: await stack.providerUrl(), token: stack.instanceToken },
                    { providerUrl: await stack.providerUrl(), token: stack.namedToken },
                    stack.cmsUrl,
                    true,
                );
                report.journal = await exerciseBulkJournal(stack.providerName, stack.id);
                await publishPerformancePages(connection);
                const literal = await measureResource(stack, "/performance-literal");
                report.literal = literal;
                const image = await measureResource(stack, "/performance-image");
                report.image = image;
                const page = await fetch(`${stack.cmsUrl}/performance-image`);
                const html = await page.text();
                const path = [...html.matchAll(/(?:src|href)="([^" ]*\/_content\/[^" ]+)"/g)]
                    .map((match) => match[1]!)
                    .find((url) => url.includes("/_content/bloc"));
                expect(path, "a real immutable asset must be measured").toBeDefined();
                const asset = await measureResource(stack, path!);
                report.asset = asset;
                for (const [sample, operations, calls] of [
                    [literal, 26, 5],
                    [image, 30, 5],
                    [asset, 22, 5],
                ] as const) {
                    expect(sample.mongoPerRequest).toBeGreaterThan(0); // This budget deliberately disables the Edge cache.
                    expect(sample.mongoByCollection?.gateway_delegations ?? 0).toBe(0);
                    // Preserve the previous delivery ceiling after charging the separately verified routing floor.
                    expect(sample.mongoPerRequest - sample.routingMongoPerRequest).toBeLessThanOrEqual(operations);
                    expect(sample.internalCallsPerRequest).toBeGreaterThan(0);
                    expect(sample.internalCallsPerRequest).toBeLessThanOrEqual(calls);
                    expect(sample.bytesPerRequest).toBeLessThan(512 * 1024);
                }
                const uncachedLoad = await exerciseLoad(stack, connection);
                report.loadWithoutCache = uncachedLoad;
                assertDeliveryLoad(uncachedLoad);
                await stack.setResponseCache(true);
                report.cachedPage = await measureCached(stack, "/performance-image");
                report.cachedAsset = await measureCached(stack, path!);
                const cachedLoad = await exerciseLoad(stack, connection);
                report.loadWithCache = cachedLoad;
                assertDeliveryLoad(cachedLoad);
                report.freshness = await exerciseFreshness(connection, stack.cmsUrl);
                report.mutations = await exerciseMutationFreshness(connection, stack.cmsUrl, {
                    origin: stack.namedUrl,
                    administrator: stack.administrator,
                });
                const authenticated = await connection.page.request.get(`${stack.cmsUrl}/performance-image`);
                expect(authenticated.status()).toBe(200);
                expect(authenticated.headers()["cache-control"]).toBe("private, no-store");
            } catch (error) {
                throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
            }
        } catch (error) {
            report.failure = "delivery-journey-failed";
            throw error;
        } finally {
            const findings = await cleanup.close();
            report.cleanup = findings;
            const status = report.failure || findings.length ? "failed" : "passed";
            const path = await writeSupplementary(start, report, status);
            console.log(`Delivery performance report: ${path}`);
            if (findings.length) {
                throw new Error("Delivery performance fixture cleanup failed");
            }
        }
    },
    600_000,
);
