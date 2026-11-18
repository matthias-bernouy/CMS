import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { sampleScenario as samplesWithStorage } from "./samples";
import type { Observation } from "../clients/types";

const sampleScenario: typeof samplesWithStorage = (
    stack,
    definition,
    obligation,
    prepare,
    collect,
    reset = async () => {},
) => samplesWithStorage(stack, definition, obligation, prepare, collect, reset);

const stack = { id: "unit", providerName: "unit", edgeName: "unit" };

test("sequential warm and measured samples collect, verify and release before the next preparation", async () => {
    const fixture = await inventoryFixture();
    const obligation = { ...fixture.scenario.obligations[0]!, variant: "warm" as const };
    const events: string[] = [];
    let live = 0;
    const result = await sampleScenario(
        stack,
        { ...fixture.scenario, samples: 2, obligations: [obligation] },
        obligation,
        async (index) => {
            expect(live).toBe(0);
            live++;
            events.push(`prepare:${index}`);
            return {
                async send() {
                    events.push(`send:${index}`);
                    return { ...fixture.measurement, traceId: String(index) };
                },
                async verify() {
                    events.push(`verify:${index}`);
                },
                async close() {
                    events.push(`close:${index}`);
                    live--;
                },
            };
        },
        async (_stack, scenario, selected, observations, phase = "measurement") =>
            observations.map((row) => {
                events.push(`collect:${row.traceId}`);
                return {
                    ...fixture.measurement,
                    ...row,
                    scenario,
                    obligation: selected,
                    phase,
                    invocations: fixture.measurement.invocations.map((witness) => ({
                        ...witness,
                        traceId: row.traceId,
                    })),
                };
            }),
    );
    expect(result.status).toBe("passed");
    expect(live).toBe(0);
    expect(events).toEqual(
        [0, 1, 2, 3, 4].flatMap((index) => [
            `prepare:${index}`,
            `send:${index}`,
            `collect:${index}`,
            `verify:${index}`,
            `close:${index}`,
        ]),
    );
});

test("concurrent cleanup waits for every started request even when another send throws synchronously", async () => {
    const fixture = await inventoryFixture();
    const obligation = { ...fixture.scenario.obligations[0]!, variant: "concurrent" as const };
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let started = 0;
    let closed = 0;
    const run = sampleScenario(
        stack,
        { ...fixture.scenario, samples: 2, obligations: [obligation] },
        obligation,
        async (index) => ({
            send(): Promise<Observation> {
                started++;
                if (index === 0) {
                    throw new Error("private transport exception");
                }
                return gate.then(() => ({ ...fixture.measurement, traceId: "survivor" }));
            },
            async close() {
                closed++;
            },
        }),
        async (_stack, scenario, selected, observations) =>
            observations.map((row) => ({ ...fixture.measurement, ...row, scenario, obligation: selected })),
    );
    await Bun.sleep(5);
    expect(started).toBe(2);
    expect(closed).toBe(0);
    release();
    const result = await run;
    expect(result.status).toBe("blocked");
    expect(result.measurements).toHaveLength(1);
    expect(closed).toBe(2);
    expect(JSON.stringify(result)).not.toContain("private transport exception");
});

test("the declared ten-request workload still starts ten simultaneous sends and keeps all resources until collection", async () => {
    const fixture = await inventoryFixture();
    const obligation = { ...fixture.scenario.obligations[0]!, variant: "concurrent" as const };
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let live = 0;
    let started = 0;
    const run = sampleScenario(
        stack,
        {
            ...fixture.scenario,
            samples: 10,
            obligations: [obligation],
            load: { concurrency: 10, minimumRequestsPerMinute: 1 },
        },
        obligation,
        async (index) => {
            live++;
            return {
                async send() {
                    started++;
                    await gate;
                    return { ...fixture.measurement, traceId: `load-${index}` };
                },
                async close() {
                    live--;
                },
            };
        },
        async (_stack, scenario, selected, observations) => {
            expect(live).toBe(10);
            return observations.map((row) => ({
                ...fixture.measurement,
                ...row,
                scenario,
                obligation: selected,
                invocations: fixture.measurement.invocations.map((witness) => ({ ...witness, traceId: row.traceId })),
            }));
        },
    );
    await Bun.sleep(5);
    expect(started).toBe(10);
    expect(live).toBe(10);
    release();
    const result = await run;
    expect(result.status).toBe("passed");
    expect(result.load?.concurrency).toBe(10);
    expect(result.load?.requests).toBe(10);
    expect(result.load?.errors).toBe(0);
    expect(live).toBe(0);
});
