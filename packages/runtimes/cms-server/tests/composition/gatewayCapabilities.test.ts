import { expect, test } from "bun:test";
import { mountProductionSurfaces, type ProductionSurfaceRuntime } from "../../src/runtime/mountSurfaces";
import { surfaceMountFixtures } from "./surfaceMountFixtures";

test("production composition supplies the generic capability gateway without media services", async () => {
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
        catalogue: {},
        isAdministrator: async () => true,
        administrators: {
            canRevoke: async () => true,
            list: async () => [],
            set: async () => ({ enabled: true, revision: 1, bootstrap: false }),
        },
    };

    const mounted = await mountProductionSurfaces({ ...surfaceMountFixtures(), gateway } as never, runtime);
    try {
        const controlConfiguration = captured.control?.configuration as Record<string, unknown>;
        const controlGateway = controlConfiguration.capabilityGateway as Record<string, unknown>;
        const deliveryGateway = captured.delivery?.capabilityGateway as Record<string, unknown>;
        expect(controlGateway.invoker).toBe(gateway.invoker);
        expect(deliveryGateway.invoker).toBe(gateway.invoker);
        expect(controlGateway).not.toHaveProperty("images");
        expect(deliveryGateway).not.toHaveProperty("images");
    } finally {
        await mounted.stop();
    }
});
