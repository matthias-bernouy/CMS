import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { sampleScenario } from "./samples";
import type { Observation } from "../clients/types";
import { witnessed } from "../../capabilities/evidence";

test("warm-ups, actual samples and postconditions are distinct and all prepared resources are released", async () => {
    const f = await inventoryFixture();
    const obligation = { ...f.scenario.obligations[0]!, variant: "warm" as const };
    const definition = { ...f.scenario, samples: 2, obligations: [obligation] };
    let nextId = 0;
    let verified = 0;
    let closed = 0;
    const result = await sampleScenario(
        { id: "unit", providerName: "unit", edgeName: "unit" },
        definition,
        obligation,
        async () => ({
            send: async () => ({ ...f.measurement, traceId: `trace-${++nextId}` }),
            verify: async () => {
                verified++;
            },
            close: async () => {
                closed++;
            },
        }),
        async (_stack, scenario, selected, observations, phase = "measurement") =>
            observations.map((row) => ({
                ...f.measurement,
                ...row,
                scenario,
                obligation: selected,
                phase,
                invocations: f.measurement.invocations.map((invocation) => ({ ...invocation, traceId: row.traceId })),
            })),
    );
    expect(result.status).toBe("passed");
    expect(result.measurements.filter((sample) => sample.phase === "preparation")).toHaveLength(3);
    expect(result.measurements.filter((sample) => sample.phase === "measurement")).toHaveLength(2);
    expect(verified).toBe(5);
    expect(closed).toBe(5);
});

test("a failed persisted-state postcondition revokes coverage of the otherwise successful response", async () => {
    const f = await inventoryFixture();
    const result = await sampleScenario(
        { id: "unit", providerName: "unit", edgeName: "unit" },
        f.scenario,
        f.scenario.obligations[0]!,
        async () => ({
            send: async () => f.measurement,
            verify: async () => {
                throw new Error("State did not match the response");
            },
        }),
        async () => [f.measurement],
    );
    expect(result.status).toBe("failed");
    expect(result.failure).toBe("business-state-postcondition-failed");
    expect(result.measurements.every((sample) => !witnessed(sample))).toBe(true);
});

test("failed business requests retain measured failures and teardown failure does not stop remaining cleanup", async () => {
    const f = await inventoryFixture();
    let prepared = 0;
    let closed = 0;
    const run = (failCleanup: boolean) =>
        sampleScenario(
            { id: "unit", providerName: "unit", edgeName: "unit" },
            { ...f.scenario, samples: 2 },
            f.scenario.obligations[0]!,
            async () => {
                const id = ++prepared;
                return {
                    send: async (): Promise<Observation> => ({
                        ...f.measurement,
                        traceId: `trace-${id}`,
                        status: 503,
                        validated: false,
                        failure: "http-status-503",
                    }),
                    verify: async () => {
                        throw new Error("Invalid requests must not enter successful postconditions");
                    },
                    close: async () => {
                        closed++;
                        if (failCleanup) {
                            throw new Error("Cleanup failed");
                        }
                    },
                };
            },
            async (_stack, scenario, obligation, observations) =>
                observations.map((row) => ({ ...f.measurement, ...row, scenario, obligation })),
        );
    const result = await run(false);
    expect(result.status).toBe("failed");
    expect(result.measurements).toHaveLength(2);
    expect(result.failure).toBe("http-status-503");
    expect(closed).toBe(2);
    const cleanupFailure = await run(true);
    expect(cleanupFailure.status).toBe("blocked");
    expect(closed).toBe(4);
});
