import { describe, expect, test } from "bun:test";
import { mountProductionKernel, type ProductionKernelRuntime } from "../../src/runtime/mountKernel";
import { createMemoryLogger } from "@bernouy/logging/testing";

describe("production Kernel mounting", () => {
    test("mounts and stops one runtime", async () => {
        const events: string[] = [];
        const logs = createMemoryLogger({ service: "kernel-test" });
        let kernelConfig: Record<string, unknown> | undefined;
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

        class FakeKernel {
            constructor(config: Record<string, unknown>) {
                kernelConfig = config;
                events.push("kernel");
            }
        }

        const runtime = {
            Runner: FakeRunner,
            Kernel: FakeKernel,
        } as unknown as ProductionKernelRuntime;
        const token = (name: string) => ({ name });
        const options = {
            env: {
                MODE: "PROD" as const,
                KERNEL_PORT: 3100,
                KERNEL_HOST: "127.0.0.1",
                KERNEL_PUBLIC_URL: "https://www.example.test",
                CMS_INSTALLATIONS_PROVIDER_URL: "https://provider.example.test",
                CMS_INSTALLATIONS_PROVIDER_TOKEN: "opaque-ulvia-instance-token",
            },
            content: {
                content: token("content"),
                editorialPages: token("editorial-pages"),
                collectionAssets: token("collection-assets"),
                sitemap: async () => new Response(),
                robots: async () => new Response(),
            },
            gateway: {
                invoker: token("invoker"),
                resolveCapability: async () => null,
                resolveActor: async () => ({ kind: "anonymous" }),
                pageCapabilities: token("page-capabilities"),
            },
            logger: logs.logger,
        };

        const mounted = await mountProductionKernel(options as never, runtime);
        expect(events.slice(0, 3)).toEqual(["runner", "kernel", 'start:{"port":3100,"hostname":"127.0.0.1"}']);
        expect(endpoints.get("/healthz")?.().status).toBe(204);
        expect(endpoints.get("/readyz")?.().status).toBe(204);
        expect(runnerOptions).toMatchObject({ idleTimeoutSeconds: 60, logger: logs.logger });

        expect(kernelConfig).toMatchObject({
            content: options.content.content,
            editorialPages: options.content.editorialPages,
            collectionAssets: options.content.collectionAssets,
            runner: expect.any(FakeRunner),
            resolveActor: expect.any(Function),
            sessionCookie: { secure: true },
            capabilityGateway: {
                siteId: "default",
                invoker: options.gateway.invoker,
                resolveCapability: options.gateway.resolveCapability,
            },
            pageCapabilities: options.gateway.pageCapabilities,
        });
        expect(kernelConfig).not.toHaveProperty("capabilityHandler");
        expect(kernelConfig).not.toHaveProperty("queryHandler");
        expect(events).toContain('start:{"port":3100,"hostname":"127.0.0.1"}');
        expect(logs.records.some((record) => record.event === "kernel.started")).toBeTrue();

        await mounted.stop();
        expect(events.at(-1)).toBe("stop");
    });
});
