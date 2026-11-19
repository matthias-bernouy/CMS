import { expect, test } from "bun:test";
import { RouteJsonCache } from "../../../src/runtime/gateway/control/RouteJsonCache";

test("exact source decoding is immutable, context-local, and never normalizes different JSON", () => {
    const cache = new RouteJsonCache("snapshot");
    const source = '{"route":{"items":[{"value":"a"}]},"__proto__":{"safe":true}}';
    const value = cache.parse(source) as { route: { items: { value: string }[] } };
    expect(value).toEqual(JSON.parse(source));
    expect(cache.parse(source)).toBe(value);
    expect(new RouteJsonCache("snapshot").parse(source)).not.toBe(value);
    expect(Reflect.set(value.route.items[0]!, "value", "poison")).toBeFalse();
    expect(() => value.route.items.push({ value: "poison" })).toThrow();
    expect(cache.parse(source)).toEqual(JSON.parse(source));
    expect(cache.parse(`${source} `)).not.toBe(value);
    expect(cache.parse(source.replace('"a"', '"b"'))).not.toEqual(value);
});

test("count bound evicts least recently used decoded content", () => {
    const cache = new RouteJsonCache("snapshot", 2, 100_000);
    const a = cache.parse('{"a":1}');
    const b = cache.parse('{"b":1}');
    expect(cache.parse('{"a":1}')).toBe(a);
    cache.parse('{"c":1}');
    expect(cache.parse('{"a":1}')).toBe(a);
    expect(cache.parse('{"b":1}')).not.toBe(b);
});

test("retained byte bound evicts entries and oversized data falls back without evicting useful content", () => {
    const cache = new RouteJsonCache("snapshot", 128, 350);
    const a = cache.parse('{"a":1}');
    cache.parse('{"b":1}');
    expect(cache.parse('{"a":1}')).not.toBe(a);
    const retained = cache.parse('{"a":1}');
    const source = JSON.stringify({ large: "x".repeat(1_000) });
    const oversized = cache.parse(source);
    expect(oversized).toEqual(JSON.parse(source));
    expect(Object.isFrozen(oversized)).toBeFalse();
    expect(cache.parse(source)).not.toBe(oversized);
    expect(cache.parse('{"a":1}')).toBe(retained);
});

test("syntax errors preserve native errors without retaining failed parses", () => {
    const cache = new RouteJsonCache("snapshot");
    for (const source of ["{", '{"a":}', "\uFEFF{}", '{"x":"\n"}']) {
        let reference: unknown;
        try {
            JSON.parse(source);
        } catch (error) {
            reference = error;
        }
        for (let attempt = 0; attempt < 2; attempt += 1) {
            expect(() => cache.parse(source)).toThrow(reference as Error);
        }
    }
    for (const source of ["null", "false", "42", '"text"', "[]"]) {
        expect(cache.parse(source)).toEqual(JSON.parse(source));
    }
    const valid = cache.parse('{"recovered":true}');
    expect(cache.parse('{"recovered":true}')).toBe(valid);
});

test("reply cache retains only route-shaped data, and freezing handles deeply nested JSON iteratively", () => {
    const replies = new RouteJsonCache("reply");
    const secret = '{"token":"fresh-only","instanceId":"a"}';
    expect(replies.parse(secret)).not.toBe(replies.parse(secret));
    const route = '{"route":"{}"}';
    expect(replies.parse(route)).toBe(replies.parse(route));
    const source = '{"child":'.repeat(2_000) + "null" + "}".repeat(2_000);
    const cache = new RouteJsonCache("snapshot");
    const nested = cache.parse(source);
    expect(Object.isFrozen(nested)).toBeTrue();
    expect(cache.parse(source)).toBe(nested);
});
