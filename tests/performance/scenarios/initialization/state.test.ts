import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { sampleScenario } from "../../harness/execution/samples";
import { witnessed } from "../../capabilities/evidence";
import { initializationStateGuard } from "./state";

const initial = () => ({
    status: { status: "pending", revision: 0 },
    pages: { items: [] as string[] },
    collections: { revision: 0, items: [] as string[] },
    settings: { revision: 1, name: "Original" },
});

async function sequence(binding: "http" | "mcp", corrupt?: keyof ReturnType<typeof initial>) {
    const f = await inventoryFixture();
    const obligation = { ...f.scenario.obligations[0]!, binding, variant: "cold" as const };
    const definition = { ...f.scenario, samples: 3, obligations: [obligation] };
    const before = initial();
    const current = structuredClone(before);
    const guard = initializationStateGuard(before, true);
    const verified: number[] = [];
    let restarts = 0;
    const result = await sampleScenario(
        { id: "unit", providerName: "unit", edgeName: "unit" },
        definition,
        obligation,
        async (index) => ({
            async send() {
                await guard.restart(async () => {
                    restarts++;
                    current.settings.revision++;
                });
                if (index === 1) {
                    if (corrupt === "settings") {
                        current.settings.name = "Unexpected";
                    }
                    if (corrupt === "pages") {
                        current.pages.items.push("unexpected-page");
                    }
                    if (corrupt === "collections") {
                        current.collections.items.push("unexpected-collection");
                    }
                    if (corrupt === "status") {
                        current.status.status = "initialized";
                    }
                }
                return { ...f.measurement, traceId: crypto.randomUUID() };
            },
            async verify() {
                verified.push(current.settings.revision);
                if (guard.changed(structuredClone(current)).length) {
                    throw new Error("Unexpected business state change");
                }
            },
        }),
        async (_stack, scenario, selected, observations, phase = "measurement") =>
            observations.map((row) => ({
                ...f.measurement,
                ...row,
                scenario,
                obligation: selected,
                phase,
                invocations: [
                    {
                        target: selected.target,
                        binding: selected.binding,
                        traceId: row.traceId,
                        durationMs: 1,
                        success: true,
                        firstInProcess: true,
                        epoch: row.traceId,
                    },
                ],
            })),
        async () => {},
    );
    return { result, before, current, verified, restarts };
}

test("cold initialization validates all three intermediate restart states through the real sequential sampler", async () => {
    for (const binding of ["http", "mcp"] as const) {
        const state = await sequence(binding);
        expect(state.result.status).toBe("passed");
        expect(state.verified).toEqual([2, 3, 4]);
        expect(state.restarts).toBe(3);
        expect(state.before).toEqual(initial());
        expect(state.result.measurements).toHaveLength(3);
        expect(state.result.measurements.every(witnessed)).toBe(true);
    }
});

test("runtime revision calibration cannot conceal settings, pages, collections or pending-status mutation", async () => {
    for (const binding of ["http", "mcp"] as const) {
        for (const field of ["settings", "pages", "collections", "status"] as const) {
            const state = await sequence(binding, field);
            expect(state.result.status).toBe("failed");
            expect(state.result.failure).toBe("business-state-postcondition-failed");
            expect(state.verified).toEqual([2, 3, 4]);
            expect(state.result.measurements.map(witnessed)).toEqual([true, false, false]);
        }
    }
});

test("a failed runtime restart does not advance the durable-state expectation", async () => {
    const before = initial();
    const guard = initializationStateGuard(before, true);
    await expect(
        guard.restart(async () => {
            throw new Error("Restart failed");
        }),
    ).rejects.toThrow();
    expect(guard.changed(before)).toEqual([]);
    await guard.restart(async () => {});
    expect(guard.changed({ ...before, settings: { ...before.settings, revision: 2 } })).toEqual([]);
});
