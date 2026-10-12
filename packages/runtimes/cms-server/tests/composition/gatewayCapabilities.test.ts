import { expect, test } from "bun:test";
import { mountProductionKernel, type ProductionKernelRuntime } from "../../src/runtime/mountKernel";
import { kernelMountFixtures } from "./kernelMountFixtures";

test("production composition supplies one generic capability gateway", async () => {
    let captured: Record<string, unknown> | undefined;
    class FakeRunner {
        readonly basePath = "/";
        start(): void {}
        async stopGracefully(): Promise<void> {}
    }
    const runtime = {
        Runner: FakeRunner,
        Kernel: class {
            readonly ready = Promise.resolve();
            constructor(config: Record<string, unknown>) {
                captured = config;
            }
        },
        log() {},
        reportError() {},
    } as unknown as ProductionKernelRuntime;
    const gateway = {
        siteId: "site:main",
        invoker: { invoke: async () => ({ kind: "success" }) },
        access: {},
        catalogue: {},
        pageExecutions: {},
        isAdministrator: async () => true,
        resolveCapabilityAccess: async () => "public" as const,
    };

    const mounted = await mountProductionKernel({ ...kernelMountFixtures(), gateway } as never, runtime);
    try {
        const configured = captured?.capabilityGateway as Record<string, unknown>;
        expect(configured.invoker).toBe(gateway.invoker);
        expect(configured.pageExecutions).toBe(gateway.pageExecutions);
        expect(configured).not.toHaveProperty("images");
    } finally {
        await mounted.stop();
    }
});
