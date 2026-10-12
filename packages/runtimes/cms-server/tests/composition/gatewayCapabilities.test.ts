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
        invoker: {
            resolveHttp: async () => ({ capability: { id: "read" }, binding: {}, pathValues: {} }),
            invoke: async () => ({ kind: "success" }),
        },
        access: {},
        pageExecutions: {
            activate: async () => ({}),
            authorize: async () => ({}),
        },
        isAdministrator: async () => true,
        resolvePageCapability: async () => ({ access: "public" as const, version: "1.0.0" }),
    };

    const mounted = await mountProductionKernel({ ...kernelMountFixtures(), gateway } as never, runtime);
    try {
        const configured = captured?.capabilityGateway as Record<string, unknown>;
        expect(configured.invoker).toBe(gateway.invoker);
        expect(captured?.pageExecution).toBeDefined();
        expect(configured).not.toHaveProperty("pageExecutions");
        expect(configured).not.toHaveProperty("resolveCapabilityAccess");
        expect(configured).not.toHaveProperty("images");
    } finally {
        await mounted.stop();
    }
});
