import { describe, expect, test } from "bun:test";
import { InvalidIJsonValueError } from "../../src/core/canonical/assertIJson";
import { canonicalJsonBytes, canonicalizeJson } from "../../src/core/canonical/canonicalizeJson";

describe("RFC 8785 canonical JSON", () => {
    test("orders object names recursively by raw UTF-16 code units", () => {
        const input = {
            z: { beta: 2, alpha: 1 },
            "\ue000": "private-use",
            "\u{1f600}": "astral",
        };

        expect(canonicalizeJson(input)).toBe('{"z":{"alpha":1,"beta":2},"😀":"astral","":"private-use"}');
    });

    test("uses ECMAScript primitive and string serialization without escaping slash or non-ASCII text", () => {
        const input = {
            literals: [null, true, false],
            numbers: [333333333.33333329, 1e30, 4.5, 0.002, 1e-27, -0],
            string: "€/$\b\t\n\f\r\u0000",
        };

        expect(canonicalizeJson(input)).toBe(
            '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27,0],"string":"€/$\\b\\t\\n\\f\\r\\u0000"}',
        );
    });

    test("preserves Unicode contents without normalization and emits UTF-8 without a BOM", () => {
        const composed = canonicalJsonBytes({ text: "é" });
        const decomposed = canonicalJsonBytes({ text: "e\u0301" });

        expect(new TextDecoder().decode(composed)).toBe('{"text":"é"}');
        expect(composed[0]).toBe(0x7b);
        expect(composed).not.toEqual(decomposed);
    });

    test.each([
        ["isolated high surrogate value", { value: "\ud800" }],
        ["isolated low surrogate value", { value: "\udc00" }],
        ["isolated surrogate property name", { ["\ud800"]: true }],
        ["NaN", { value: Number.NaN }],
        ["positive infinity", { value: Number.POSITIVE_INFINITY }],
        ["undefined", { value: undefined }],
        ["bigint", { value: 1n }],
        ["non-plain object", { value: new Date(0) }],
        ["symbol property", Object.assign({}, { [Symbol("hidden")]: true })],
    ])("rejects %s", (_label, input) => {
        expect(() => canonicalizeJson(input)).toThrow(InvalidIJsonValueError);
    });

    test("rejects sparse arrays and circular references", () => {
        const sparse: unknown[] = [];
        sparse.length = 1;
        const circular: { self?: unknown } = {};
        circular.self = circular;

        expect(() => canonicalizeJson(sparse)).toThrow(/sparse entries/);
        expect(() => canonicalizeJson(circular)).toThrow(/circular reference/);
    });

    test("allows a valid surrogate pair", () => {
        expect(canonicalizeJson({ emoji: "\ud83d\ude00" })).toBe('{"emoji":"😀"}');
    });

    test("rejects excessive nesting without overflowing the call stack", () => {
        let nested: unknown = null;
        for (let depth = 0; depth < 65; depth += 1) {
            nested = [nested];
        }

        expect(() => canonicalizeJson(nested)).toThrow(/maximum nesting depth 64/);
    });
});
