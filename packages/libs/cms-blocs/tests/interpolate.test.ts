import { describe, test, expect } from "bun:test";
import { interpolateString, type FilterMap } from "../src/binding/interpolate";
import { type Scope } from "../src/binding/scope";

const s = (value: unknown): Scope => ({ value });

describe("interpolateString — substitution", () => {
    test("single token from implicit value", () => {
        expect(interpolateString("Hello {{ name }}", s({ name: "Ada" }))).toBe("Hello Ada");
    });

    test("multiple tokens in one string", () => {
        expect(interpolateString("{{ a }}-{{ b }}", s({ a: "x", b: "y" }))).toBe("x-y");
    });

    test("nested path", () => {
        expect(interpolateString("{{ user.email }}", s({ user: { email: "a@b.c" } }))).toBe("a@b.c");
    });

    test("no whitespace variant", () => {
        expect(interpolateString("{{name}}", s({ name: "z" }))).toBe("z");
    });
});

describe("interpolateString — the verbatim guarantee", () => {
    test("unresolved token is left exactly as written", () => {
        expect(interpolateString("go {{ BASE_PATH }}/x", s({ name: "z" }))).toBe("go {{ BASE_PATH }}/x");
    });

    test("resolved and unresolved tokens coexist in one string", () => {
        expect(interpolateString("{{ name }} {{ other }}", s({ name: "z" }))).toBe("z {{ other }}");
    });

    test("empty scope leaves every token verbatim", () => {
        expect(interpolateString("{{ a }}{{ b }}", {})).toBe("{{ a }}{{ b }}");
    });
});

describe("interpolateString — resolved nullish renders empty (not verbatim)", () => {
    test("present key with undefined value → empty string", () => {
        expect(interpolateString("[{{ x }}]", s({ x: undefined }))).toBe("[]");
    });

    test("present key with null value → empty string", () => {
        expect(interpolateString("[{{ x }}]", s({ x: null }))).toBe("[]");
    });

    test("deep miss under an owned head → empty string", () => {
        expect(interpolateString("[{{ order.id }}]", s({ order: {} }))).toBe("[]");
    });
});

describe("interpolateString — raw output (DOM APIs handle safety)", () => {
    test("HTML special chars pass through verbatim (no double-encoding)", () => {
        expect(interpolateString("{{ x }}", s({ x: `<b>&"'` }))).toBe(`<b>&"'`);
    });

    test("number and boolean stringify", () => {
        expect(interpolateString("{{ n }}/{{ b }}", s({ n: 0, b: false }))).toBe("0/false");
    });
});

describe("interpolateString — filters (injected)", () => {
    const filters: FilterMap = { up: (v) => String(v).toUpperCase(), bytes: () => "1 KB" };

    test("known filter is applied", () => {
        expect(interpolateString("{{ name | up }}", s({ name: "ada" }), filters)).toBe("ADA");
    });

    test("filtered result passes through raw", () => {
        expect(interpolateString("{{ tag | up }}", s({ tag: "<x>" }), filters)).toBe("<X>");
    });

    test("unknown filter falls through to the raw value", () => {
        expect(interpolateString("{{ name | nope }}", s({ name: "ada" }), filters)).toBe("ada");
    });

    test("no filter map → filter name ignored, raw value used", () => {
        expect(interpolateString("{{ name | up }}", s({ name: "ada" }))).toBe("ada");
    });
});

describe("interpolateString — `value` reserved word via scope", () => {
    test("primitive item via {{ value }}", () => {
        expect(interpolateString("v={{ value }}", s("a<b"))).toBe("v=a<b");
    });
});
