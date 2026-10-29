import { exerciseFreshness } from "./performance/freshness";
import { exerciseBulkJournal } from "./observability/bulk-journal";
import { verifyPublicTrace } from "./observability/public-trace";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { networkPreloadSource } from "./performance/network-preload";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { mcpContainers } from "./containers";
import { connectBrowser } from "./oauth";
import { measureResource, publishPerformancePages, exerciseLoad, measureCached } from "./performance/journey";
const enabled = process.env.ULVIA_RUN_DELIVERY_PERFORMANCE === "1";
const integration = enabled ? test : test.skip;
integration(
    "public delivery stays inside work budgets and image-capable Pages sustain 200 views/minute",
    async () => {
        const images = {
            edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE,
            provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE,
            repository: process.env.ULVIA_REPOSITORY_DOCKER_IMAGE,
        };
        if (!images.edge || !images.provider || !images.repository) {
            throw new Error("Delivery performance requires all three candidate Docker images");
        }
        const instrumentation = await mkdtemp(join(tmpdir(), "ulvia-delivery-probe-"));
        const preload = join(instrumentation, "fetch.ts");
        await writeFile(preload, networkPreloadSource());
        const stack = await mcpContainers(
            images as Record<keyof typeof images, string>,
            undefined,
            preload,
            false,
        ).catch(async (error) => {
            await rm(instrumentation, { recursive: true, force: true });
            throw error;
        });
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        const report: Record<string, unknown> = {};
        try {
            connection = await connectBrowser(stack.cmsUrl, stack.administrator);
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
                expect(sample.mongoPerRequest).toBeLessThanOrEqual(operations);
                expect(sample.internalCallsPerRequest).toBeGreaterThan(0);
                expect(sample.internalCallsPerRequest).toBeLessThanOrEqual(calls);
                expect(sample.bytesPerRequest).toBeLessThan(512 * 1024);
            }
            report.loadWithoutCache = await exerciseLoad(stack, connection);
            await stack.setResponseCache(true);
            report.cachedPage = await measureCached(stack, "/performance-image");
            report.cachedAsset = await measureCached(stack, path!);
            report.loadWithCache = await exerciseLoad(stack, connection);
            report.freshness = await exerciseFreshness(connection, stack.cmsUrl);
            const authenticated = await connection.page.request.get(`${stack.cmsUrl}/performance-image`);
            expect(authenticated.status()).toBe(200);
            expect(authenticated.headers()["cache-control"]).toBe("private, no-store");
        } catch (error) {
            report.failure = String(error);
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            try {
                await mkdir("artifacts/delivery-performance", { recursive: true });
                await writeFile("artifacts/delivery-performance/latest.json", JSON.stringify(report, null, 2));
            } finally {
                try {
                    await connection?.browser.close();
                } finally {
                    try {
                        await stack.close();
                    } finally {
                        await rm(instrumentation, { recursive: true, force: true });
                    }
                }
            }
        }
    },
    600_000,
);
