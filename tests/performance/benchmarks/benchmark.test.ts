import { expect, test } from "bun:test";
import { assertMaximum, benchmark, benchmarkEvidence } from "./benchmark";

test("empty or fractional benchmark sampling cannot produce a successful zero-duration result", async () => {
    let calls = 0;
    const operation = () => {
        calls++;
    };
    for (const options of [{ samples: 0 }, { samples: 1.5 }, { samples: 101 }, { warmups: -1 }, { warmups: NaN }]) {
        await expect(benchmark("invalid sampling fixture", operation, options)).rejects.toThrow("Benchmarks require");
    }
    expect(calls).toBe(0);
    const valid = await benchmark("separate warm-up fixture", operation, { samples: 3, warmups: 1 });
    expect(calls).toBe(4);
    expect(valid.samples).toHaveLength(3);
});

test("non-finite budget observations fail while retaining serializable evidence", () => {
    expect(() => assertMaximum("invalid metric fixture", NaN, 10)).toThrow();
    const check = benchmarkEvidence().checks.find((row) => row.label === "invalid metric fixture");
    expect(check?.finite).toBe(false);
    expect(check?.actual).toBeNull();
    expect(JSON.parse(JSON.stringify(check))).toEqual(check);
});
