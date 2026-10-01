import { expect, test } from "bun:test";
import { mountProductionSurfaces, type ProductionSurfaceRuntime } from "../../src/runtime/mountSurfaces";
import { surfaceMountFixtures } from "./surfaceMountFixtures";

test("production composition supplies one gateway image service to Control and Delivery", async () => {
    const captured: { control?: Record<string, unknown>; delivery?: Record<string, unknown> } = {};
    class FakeRunner {
        readonly basePath = "/";

        group(_prefix: string, callback: (runner: FakeRunner) => void): void {
            callback(this);
        }

        start(): void {}

        async stopGracefully(): Promise<void> {}
    }
    const runtime = {
        Runner: FakeRunner,
        Control: class {
            readonly ready = Promise.resolve();

            constructor(_runner: unknown, _repository: unknown, _auth: unknown, config: Record<string, unknown>) {
                captured.control = config;
            }
        },
        Delivery: class {
            constructor(config: Record<string, unknown>) {
                captured.delivery = config;
            }
        },
        log() {},
        reportError() {},
    } as unknown as ProductionSurfaceRuntime;
    const gateway = {
        siteId: "site:main",
        invoker: { invoke: async () => ({ kind: "success" }) },
        access: {},
        images: { get: async () => ({ status: 404 }) },
        catalogue: {},
        isAdministrator: async () => true,
    };

    const mounted = await mountProductionSurfaces({ ...surfaceMountFixtures(), gateway } as never, runtime);
    try {
        expect((captured.control?.capabilityGateway as { images: unknown }).images).toBe(gateway.images);
        expect((captured.delivery?.capabilityGateway as { images: unknown }).images).toBe(gateway.images);
        expect(captured.control).not.toHaveProperty("sourceImageInterceptor");
        expect(captured.delivery).not.toHaveProperty("sourceImageInterceptor");
    } finally {
        await mounted.stop();
    }
});
