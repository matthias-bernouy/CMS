import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryLogger } from "@bernouy/logging/testing";
import {
    startMaintenanceProbe,
    maintenancePaused,
    waitForMaintenanceRelease,
} from "../../../../../src/runtime/recovery/maintenance";
import { RecoverySupervisor } from "../../../../../src/runtime/recovery/RecoverySupervisor";
import { mountUlviaProvider } from "../../../../../src/runtime/gateway/mountUlviaProvider";
async function until(predicate: () => boolean) {
    const deadline = Date.now() + 2000;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error("Maintenance state did not converge");
        }
        await Bun.sleep(10);
    }
}
test("maintenance blocks business HTTP and background recovery until the durable gate is released", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-maintenance-")),
        file = join(root, "paused");
    await writeFile(file, "maintenance");
    const gate = await startMaintenanceProbe(file);
    let calls = 0;
    const supervisor = new RecoverySupervisor(async () => {
        calls++;
        return 0;
    }, 10);
    const reserve = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = reserve.port!;
    reserve.stop(true);
    const logs = createMemoryLogger({ service: "maintenance-test" });
    const provider = mountUlviaProvider({
        env: {
            ULVIA_PROVIDER_HOST: "127.0.0.1",
            ULVIA_PROVIDER_PORT: port,
            ULVIA_PROVIDER_OPERATOR_TOKEN: "operator-token-for-maintenance-test",
        },
        logger: logs.logger,
        authenticator: { authenticateInvocationToken: async () => null },
        lifecycle: {},
        host: {},
        routing: { authority: {}, instances: {}, authenticate: async () => null },
        readiness: async () => true,
    } as unknown as Parameters<typeof mountUlviaProvider>[0]);
    try {
        await supervisor.start();
        await Bun.sleep(30);
        expect(calls).toBe(0);
        const origin = `http://127.0.0.1:${port}`;
        expect((await fetch(`${origin}/readyz`)).headers.get("ulvia-maintenance")).toBe("paused");
        const denied = await fetch(`${origin}/forms/v2/submit`, { method: "POST", body: "{}" });
        expect(denied.status).toBe(503);
        await denied.body?.cancel();
        const controller = new AbortController();
        const waiting = waitForMaintenanceRelease(controller.signal);
        controller.abort();
        expect(await waiting).toBe(false);
        await rm(file);
        await until(() => !maintenancePaused());
        await until(() => calls > 0);
        expect((await fetch(`${origin}/readyz`)).headers.get("ulvia-maintenance")).toBe("active");
    } finally {
        await supervisor.stop();
        await provider.stop();
        await gate.stop();
        await rm(root, { recursive: true, force: true });
    }
});
