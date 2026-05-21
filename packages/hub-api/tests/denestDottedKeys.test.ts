import { test, expect } from "bun:test";
import { denestDottedKeys } from "src/core/denestDottedKeys";

test("denests dotted keys into nested objects", () => {
    expect(denestDottedKeys({ "a.b": 1, "a.c": 2, d: 3 }))
        .toEqual({ a: { b: 1, c: 2 }, d: 3 });
});

test("prototype-pollution guard: dangerous segments are dropped, Object.prototype untouched", () => {
    const out = denestDottedKeys({
        "__proto__.polluted": "x",
        "constructor.prototype.polluted": "y",
        "a.constructor.z": "w",
        "__proto__": "z",
        safe: 1,
    });
    expect(out).toEqual({ safe: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
});
