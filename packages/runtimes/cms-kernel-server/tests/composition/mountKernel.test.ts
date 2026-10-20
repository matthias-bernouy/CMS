import { describe, expect, test } from "bun:test";
import { mountProductionKernel, type ProductionKernelRuntime } from "../../src/runtime/mountKernel";
import { createMemoryLogger } from "@bernouy/logging/testing";

describe("production Kernel mounting", () => {
    test("mounts and stops one runtime", async () => {
        const events: string[] = [];
        const logs = createMemoryLogger({ service: "kernel-test" });
        let kernelConfig: Record<string, unknown> | undefined;

        class FakeRunner {
            readonly basePath = "/";
            constructor() {
                events.push("runner");
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
                ULVIA_PROVIDER_URL: "https://provider.example.test",
                ULVIA_INSTANCE_TOKEN: "opaque-ulvia-instance-token",
            },
            provider: {
                content: token("content"),
                authentication: token("authentication"),
                publicAuth: token("public-auth"),
                localAuthentication: token("local-auth"),
                gateway: token("gateway"),
                pageCapabilities: token("page-capabilities"),
                capability: async () => new Response(),
                declarativeQuery: async () => new Response(),
                collectionAsset: async () => new Response(),
                sitemap: async () => new Response(),
            },
            logger: logs.logger,
        };

        const mounted = await mountProductionKernel(options as never, runtime);
        expect(events.slice(0, 3)).toEqual(["runner", "kernel", 'start:{"port":3100,"hostname":"127.0.0.1"}']);

        expect(kernelConfig).toMatchObject({
            content: options.provider.content,
            runner: expect.any(FakeRunner),
            publicAuth: { name: "public-auth", allowSignup: false },
            capabilityGateway: options.provider.gateway,
            queryHandler: options.provider.declarativeQuery,
        });
        expect(events).toContain('start:{"port":3100,"hostname":"127.0.0.1"}');
        expect(logs.records.some((record) => record.event === "kernel.started")).toBeTrue();

        await mounted.stop();
        expect(events.at(-1)).toBe("stop");
    });
});
