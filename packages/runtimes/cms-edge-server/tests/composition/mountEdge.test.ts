import { describe, expect, test } from "bun:test";
import { createTenantEdge, type ProductionEdgeRuntime } from "../../src/runtime/mountEdge";
import { createMemoryLogger } from "@bernouy/logging/testing";

describe("production Edge mounting", () => {
    test("builds an independent tenant route tree without opening a listener", async () => {
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
            async handle(request: Request): Promise<Response> {
                events.push("handle");
                return new Response(request.url);
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

        const mounted = await createTenantEdge(options as never, runtime);
        expect(events).toEqual(["runner", "edge"]);
        expect(endpoints.size).toBe(0);
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
        const response = await mounted.handle(new Request("https://www.example.test/path"));
        expect(await response.text()).toBe("https://www.example.test/path");
        expect(events.at(-1)).toBe("handle");
    });
});
