import { describe, test, expect } from "bun:test";
import { lookup, type Scope } from "../../../src/binding/scope";

describe("lookup — presence vs absence (drives blank-on-miss)", () => {
    test("present scalar → found, exact value", () => {
        expect(lookup({ value: { title: "Hi" } }, "title")).toEqual({ found: true, value: "Hi" });
    });

    test("present nested path → found, exact value", () => {
        expect(lookup({ value: { a: { b: { c: 7 } } } }, "a.b.c")).toEqual({ found: true, value: 7 });
    });

    test("present key whose value is null → found (NOT absent)", () => {
        expect(lookup({ value: { x: null } }, "x")).toEqual({ found: true, value: null });
    });

    test("present key whose value is undefined → found (NOT absent)", () => {
        expect(lookup({ value: { x: undefined } }, "x")).toEqual({ found: true, value: undefined });
    });

    test("absent head at every level → not found (→ blanks)", () => {
        expect(lookup({ value: { title: "Hi" } }, "BASE_PATH")).toEqual({ found: false, value: undefined });
    });

    test("empty scope → not found", () => {
        expect(lookup({}, "anything")).toEqual({ found: false, value: undefined });
    });
});

describe("lookup — head decides found-ness, deep miss is empty", () => {
    test("head owned but deep key missing → found, undefined", () => {
        // `order` is in scope but has no `id` → ours, render empty (not literal braces).
        expect(lookup({ value: { order: {} } }, "order.id")).toEqual({ found: true, value: undefined });
    });

    test("head owned, intermediate hop null → found, undefined", () => {
        expect(lookup({ value: { order: null } }, "order.id")).toEqual({ found: true, value: undefined });
    });
});

describe("lookup — parent chain & shadowing", () => {
    const parent: Scope = { value: { order: { id: 9 } } };

    test("walks up to a parent frame that owns the head", () => {
        const child: Scope = { value: { line: "L1" }, parent };
        expect(lookup(child, "order.id")).toEqual({ found: true, value: 9 });
    });

    test("nearest frame shadows the parent for the same head", () => {
        const child: Scope = { value: { id: "child" }, parent: { value: { id: "parent" } } };
        expect(lookup(child, "id")).toEqual({ found: true, value: "child" });
    });

    test("named var resolves while parent stays reachable", () => {
        const child: Scope = { vars: { line: { x: 1 } }, parent };
        expect(lookup(child, "line.x")).toEqual({ found: true, value: 1 });
        expect(lookup(child, "order.id")).toEqual({ found: true, value: 9 });
    });
});

describe("lookup — named var vs implicit value priority", () => {
    test("a named var wins over an implicit-value key of the same name", () => {
        const scope: Scope = { value: { x: "fromValue" }, vars: { x: "fromVar" } };
        expect(lookup(scope, "x")).toEqual({ found: true, value: "fromVar" });
    });
});

describe("lookup — `value` reserved word", () => {
    test("primitive implicit value → itself", () => {
        expect(lookup({ value: "tag-a" }, "value")).toEqual({ found: true, value: "tag-a" });
    });

    test("object implicit value WITH a `value` key → that key", () => {
        expect(lookup({ value: { key: "k", value: "v" } }, "value")).toEqual({ found: true, value: "v" });
    });

    test("object implicit value WITHOUT a `value` key → the object itself", () => {
        const obj = { key: "k" };
        expect(lookup({ value: obj }, "value")).toEqual({ found: true, value: obj });
    });

    test("`item.value` (named) bypasses the reserved word", () => {
        const scope: Scope = { vars: { item: { value: 42 } } };
        expect(lookup(scope, "item.value")).toEqual({ found: true, value: 42 });
    });
});

describe("lookup — `.` is the current context itself", () => {
    test('returns the implicit value (used by cms-repeat=".")', () => {
        expect(lookup({ value: [1, 2, 3] }, ".")).toEqual({ found: true, value: [1, 2, 3] });
    });
    test("`.` reads the nearest frame's value, not the parent's", () => {
        expect(lookup({ value: "inner", parent: { value: "outer" } }, ".")).toEqual({ found: true, value: "inner" });
    });
});

describe("lookup — arrays (documented behaviour)", () => {
    test("`.length` on an array", () => {
        expect(lookup({ value: { items: [1, 2, 3] } }, "items.length")).toEqual({ found: true, value: 3 });
    });

    test("numeric index into an array", () => {
        expect(lookup({ value: { items: [{ name: "a" }, { name: "b" }] } }, "items.1.name")).toEqual({
            found: true,
            value: "b",
        });
    });
});
