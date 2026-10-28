import { describe, expect, test } from "bun:test";
import { mountProductionEdge, type ProductionEdgeRuntime } from "../../src/runtime/mountEdge";
import { createMemoryLogger } from "@bernouy/logging/testing";

describe("production Edge mounting", () => {
    test("mounts and stops one runtime", async () => {
        const events: string[] = [];
        const logs = createMemoryLogger({ service: "edge-test" });
        let edgeConfig: Record<string, unknown> | undefined;
        let runnerOptions: Record<string, unknown> | undefined;
        const endpoints = new Map<string, () => Response>();

        class FakeRunner {
            readonly basePath = "/";
            constructor(options: Record<string, unknown>) {
                runnerOptions = options;
                events.push("runner");
            }
            get(path: string, handler: () => Response): void {
                endpoints.set(path, handler);
            }
            start(options: unknown): void {
                events.push(`start:${JSON.stringify(options)}`);
            }
            async stopGracefully(): Promise<void> {
                events.push("stop");
            }
        }

        class FakeEdge {
            constructor(config: Record<string, unknown>) {
                edgeConfig = config;
                events.push("edge");
            }
        }

        const runtime = {
            Runner: FakeRunner,
            Edge: FakeEdge,
        } as unknown as ProductionEdgeRuntime;
        const token = (name: string) => ({ name });
        const options = {
            env: {
                MODE: "PROD" as const,
                CMS_PORT: 3100,
                CMS_HOST: "127.0.0.1",
                CMS_PUBLIC_URL: "https://www.example.test",
                CMS_INSTALLATIONS_PROVIDER_URL: "https://provider.example.test",
                CMS_INSTALLATIONS_PROVIDER_TOKEN: "opaque-ulvia-instance-token",
            },
            content: {
                content: token("content"),
                editorialPages: token("editorial-pages"),
                collectionAssets: token("collection-assets"),
                sitemap: async () => new Response(),
                robots: async () => new Response(),
                invalidatePageRenderInputs: () => events.push("invalidate-content"),
            },
            gateway: {
                invoker: token("invoker"),
                resolveCapability: async () => null,
                resolveActor: async () => ({ kind: "anonymous" }),
                pageCapabilities: token("page-capabilities"),
            },
            logger: logs.logger,
        };

        const mounted = await mountProductionEdge(options as never, runtime);
        expect(events.slice(0, 3)).toEqual(["runner", "edge", 'start:{"port":3100,"hostname":"127.0.0.1"}']);
        expect(endpoints.get("/healthz")?.().status).toBe(204);
        expect(endpoints.get("/readyz")?.().status).toBe(204);
        expect(runnerOptions).toMatchObject({ idleTimeoutSeconds: 60, logger: logs.logger });

        expect(edgeConfig).toMatchObject({
            resourceHandler: expect.any(Function),
            runner: expect.any(FakeRunner),
            resolveActor: expect.any(Function),
            sessionCookie: { secure: true },
            capabilityGateway: {
                siteId: "default",
                invoker: options.gateway.invoker,
                resolveCapability: options.gateway.resolveCapability,
            },
        });
        expect(edgeConfig).not.toHaveProperty("capabilityHandler");
        expect(edgeConfig).not.toHaveProperty("queryHandler");
        expect(edgeConfig).not.toHaveProperty("content");
        expect(edgeConfig).not.toHaveProperty("collectionAssets");
        expect(edgeConfig).not.toHaveProperty("pageCapabilities");
        expect(events).toContain('start:{"port":3100,"hostname":"127.0.0.1"}');
        expect(logs.records.some((record) => record.event === "edge.started")).toBeTrue();

        await mounted.stop();
        expect(events.at(-1)).toBe("stop");
    });
});
