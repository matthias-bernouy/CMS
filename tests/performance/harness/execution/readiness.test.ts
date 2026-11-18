import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { sampleScenario as samplesWithStorage } from "./samples";
import { ClientFailure } from "../clients/failure";
import type { measurements } from "../docker/collect";

const sampleScenario: typeof samplesWithStorage = (
    stack,
    definition,
    obligation,
    prepare,
    collect,
    reset = async () => {},
) => samplesWithStorage(stack, definition, obligation, prepare, collect, reset);

const stack = { id: "unit", providerName: "unit", edgeName: "unit" };

test("concurrent short-lived prerequisites finish after every fixture is prepared and before the measured barrier", async () => {
    const f = await inventoryFixture();
    const obligation = { ...f.scenario.obligations[0]!, variant: "concurrent" as const };
    let prepared = 0;
    let ready = 0;
    let sent = 0;
    let closed = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const collect: typeof measurements = async (_stack, scenario, selected, rows, phase = "measurement") =>
        rows.map((row) => ({
            ...f.measurement,
            ...row,
            scenario,
            obligation: selected,
            phase,
            invocations: f.measurement.invocations.map((witness) => ({ ...witness, traceId: row.traceId })),
        }));
    const run = sampleScenario(
        stack,
        { ...f.scenario, samples: 3, obligations: [obligation] },
        obligation,
        async (index) => {
            prepared++;
            return {
                async beforeMeasure() {
                    expect(prepared).toBe(3);
                    ready++;
                    await gate;
                },
                async send() {
                    expect(ready).toBe(3);
                    sent++;
                    return { ...f.measurement, traceId: `sample-${index}` };
                },
                async close() {
                    closed++;
                },
            };
        },
        collect,
    );
    await Bun.sleep(5);
    expect(ready).toBe(3);
    expect(sent).toBe(0);
    expect(closed).toBe(0);
    release();
    const result = await run;
    expect(result.status).toBe("passed");
    expect(result.measurements).toHaveLength(3);
    expect(sent).toBe(3);
    expect(closed).toBe(3);
});

test("failed short-lived prerequisite waits for every pending preparation, sends nothing and releases all fixtures", async () => {
    const f = await inventoryFixture();
    const obligation = { ...f.scenario.obligations[0]!, variant: "concurrent" as const };
    let sent = 0;
    let closed = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const run = sampleScenario(
        stack,
        { ...f.scenario, samples: 2, obligations: [obligation] },
        obligation,
        async (index) => ({
            async beforeMeasure() {
                if (index === 0) {
                    throw new ClientFailure("fixture-ticket-refused");
                }
                await gate;
            },
            async send() {
                sent++;
                return f.measurement;
            },
            async close() {
                closed++;
            },
        }),
        async () => {
            throw new Error("No measurement may be fabricated");
        },
    );
    await Bun.sleep(5);
    expect(closed).toBe(0);
    release();
    const result = await run;
    expect(result.status).toBe("blocked");
    expect(result.failure).toContain("fixture-ticket-refused");
    expect(result.measurements).toEqual([]);
    expect(sent).toBe(0);
    expect(closed).toBe(2);
});

test("warm-up and measured samples each refresh expiring prerequisites outside their invocation", async () => {
    const f = await inventoryFixture();
    const obligation = { ...f.scenario.obligations[0]!, variant: "warm" as const };
    let ready = false;
    let refreshed = 0;
    const result = await sampleScenario(
        stack,
        { ...f.scenario, samples: 2, obligations: [obligation] },
        obligation,
        async (index) => ({
            async beforeMeasure() {
                expect(ready).toBe(false);
                ready = true;
                refreshed++;
            },
            async send() {
                expect(ready).toBe(true);
                ready = false;
                return { ...f.measurement, traceId: `sample-${index}` };
            },
        }),
        async (_stack, scenario, selected, rows, phase = "measurement") =>
            rows.map((row) => ({
                ...f.measurement,
                ...row,
                scenario,
                obligation: selected,
                phase,
                invocations: f.measurement.invocations.map((witness) => ({ ...witness, traceId: row.traceId })),
            })),
    );
    expect(result.status).toBe("passed");
    expect(refreshed).toBe(5);
    expect(result.measurements.filter((row) => row.phase === "preparation")).toHaveLength(3);
    expect(result.measurements.filter((row) => row.phase === "measurement")).toHaveLength(2);
});
