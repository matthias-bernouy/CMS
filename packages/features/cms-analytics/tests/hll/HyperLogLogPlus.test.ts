import { describe, expect, test } from "bun:test";
import { HyperLogLogPlus } from "cms-analytics/core/hll/HyperLogLogPlus";
import { sha256HexAsync } from "cms-analytics/core/identity/sha256Hex";

describe("HyperLogLogPlus", () => {
    test("deduplicates repeated inputs without retaining their hashes", async () => {
        const sketch = new HyperLogLogPlus(12);
        const hash = await sha256HexAsync("visitor");
        for (let index = 0; index < 20; index++) {
            sketch.addHex(hash);
        }

        expect(sketch.estimate()).toBe(1);
        expect(sketch.entries()).toHaveLength(1);
        expect(JSON.stringify(sketch.snapshot())).not.toContain(hash);
    });

    test("stays accurate through the low-cardinality range", async () => {
        for (const cardinality of [10, 100, 500, 1_000]) {
            const sketch = new HyperLogLogPlus(12);
            for (let index = 0; index < cardinality; index++) {
                sketch.addHex(await sha256HexAsync(`visitor-${index}`));
            }
            const relativeError = Math.abs(sketch.estimate() - cardinality) / cardinality;
            expect(relativeError).toBeLessThan(0.06);
        }
    });

    test("promotes sparse registers to a bounded dense representation", async () => {
        const sketch = new HyperLogLogPlus(12);
        for (let index = 0; index < 2_000; index++) {
            sketch.addHex(await sha256HexAsync(`dense-${index}`));
        }

        expect(sketch.mode).toBe("dense");
        const snapshot = sketch.snapshot();
        expect(snapshot.registers).toBeInstanceOf(Uint8Array);
        expect((snapshot.registers as Uint8Array).byteLength).toBe(4_096);
    });

    test("register-max merge is idempotent and order independent", async () => {
        const left = new HyperLogLogPlus(12);
        const right = new HyperLogLogPlus(12);
        for (let index = 0; index < 1_000; index++) {
            const hash = await sha256HexAsync(`merge-${index}`);
            (index % 2 ? left : right).addHex(hash);
        }

        const first = HyperLogLogPlus.fromSnapshot(left.snapshot());
        first.merge(right);
        first.merge(right);
        const second = HyperLogLogPlus.fromSnapshot(right.snapshot());
        second.merge(left);

        expect(first.entries()).toEqual(second.entries());
        expect(first.estimate()).toBe(second.estimate());
        expect(Math.abs(first.estimate() - 1_000) / 1_000).toBeLessThan(0.06);
    });

    test("rejects incompatible sketches and invalid register writes", () => {
        expect(() => new HyperLogLogPlus(3)).toThrow();
        expect(() => new HyperLogLogPlus(12).addHex("not-a-hash")).toThrow();
        expect(() => new HyperLogLogPlus(12).setRegister(4_096, 1)).toThrow();
        expect(() => new HyperLogLogPlus(12).merge(new HyperLogLogPlus(13))).toThrow();
    });
});
