import { describe, test, expect } from "bun:test";
import { parseRepeat } from "../../../src/binding/render/repeat";

describe("parseRepeat", () => {
    test("bare path", () => {
        expect(parseRepeat("products")).toEqual({ path: "products" });
    });

    test("dotted path", () => {
        expect(parseRepeat("order.lines")).toEqual({ path: "order.lines" });
    });

    test("named form `path as name`", () => {
        expect(parseRepeat("order.lines as line")).toEqual({ path: "order.lines", name: "line" });
    });

    test("a path containing the letters 'as' is NOT a named binding", () => {
        expect(parseRepeat("tasks")).toEqual({ path: "tasks" });
    });

    test("surrounding whitespace trimmed", () => {
        expect(parseRepeat("  items  ")).toEqual({ path: "items" });
        expect(parseRepeat("  items   as   it  ")).toEqual({ path: "items", name: "it" });
    });
});
