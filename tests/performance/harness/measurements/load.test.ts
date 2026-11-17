import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { auditLoad, measuredLoad } from "./load";

test("actual elapsed time gates throughput and failed or missing load metrics cannot turn green", async () => {
    const f = await inventoryFixture();
    const definition = { ...f.scenario, samples: 10, load: { concurrency: 10, minimumRequestsPerMinute: 200 } };
    const observations = Array.from({ length: 10 }, () => f.measurement);
    const load = measuredLoad(10, 1000, observations);
    const result = { scenario: definition.id, status: "passed" as const, measurements: [], load };
    expect(load.requestsPerMinute).toBe(600);
    expect(auditLoad(definition, result)).toEqual([]);
    expect(auditLoad(definition)[0]?.code).toBe("missing-load-measurement");
    expect(auditLoad(definition, { ...result, load: measuredLoad(10, 4000, observations) })[0]?.code).toBe(
        "throughput-budget-exceeded",
    );
    expect(auditLoad(definition, { ...result, load: { ...load, requestsPerMinute: 999 } })[0]?.code).toBe(
        "invalid-load-measurement",
    );
    expect(auditLoad(definition, { ...result, load: { ...load, errors: 1, timeouts: 1 } })[0]?.code).toBe(
        "load-errors",
    );
    for (const patch of [
        { requests: undefined },
        { errors: undefined },
        { concurrency: 1.5 },
        { errors: 11 },
        { errors: 0, timeouts: 1 },
    ]) {
        const invalid = JSON.parse(JSON.stringify({ ...result, load: { ...load, ...patch } }));
        expect(auditLoad(definition, invalid)[0]?.code).toBe("invalid-load-measurement");
    }
});
