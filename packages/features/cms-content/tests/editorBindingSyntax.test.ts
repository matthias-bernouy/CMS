import { describe, expect, test } from "bun:test";
import {
    CMS_BINDING_ATTRIBUTES,
    asCondition,
    asInterpolation,
    asRepeat,
    asSource,
    isInterpolation,
    parseCondition,
    parseInterpolation,
    parseRepeat,
    parseSource,
} from "@bernouy/cms-content/editor";

describe("editor binding syntax", () => {
    test("formats interpolation expressions", () => {
        expect(asInterpolation("plan.name")).toBe("{{ plan.name }}");
        expect(asInterpolation("  plan.price  ")).toBe("{{ plan.price }}");
    });

    test("parses interpolation expressions", () => {
        expect(parseInterpolation("{{ plan.name }}")).toBe("plan.name");
        expect(parseInterpolation("  {{ plans[0].cta.label }}  ")).toBe("plans[0].cta.label");
        expect(parseInterpolation("plain text")).toBeNull();
        expect(parseInterpolation("{{ }}")).toBeNull();
    });

    test("detects interpolation expressions", () => {
        expect(isInterpolation("{{ plan.name }}")).toBe(true);
        expect(isInterpolation("Hello {{ plan.name }}")).toBe(false);
    });

    test("formats and parses source URLs", () => {
        expect(asSource(" /api/plans ")).toBe("/api/plans");
        expect(asSource("https://example.com/api/plans")).toBe("https://example.com/api/plans");
        expect(parseSource(" {{BASE_PATH}}/api/plans ")).toBe("{{BASE_PATH}}/api/plans");
        expect(parseSource("")).toBeNull();
        expect(parseSource("   ")).toBeNull();
    });

    test("formats repeat bindings", () => {
        expect(asRepeat({ path: "items" })).toBe("items");
        expect(asRepeat({ path: " order.lines ", alias: " line " })).toBe("order.lines as line");
    });

    test("parses repeat bindings", () => {
        expect(parseRepeat("items")).toEqual({ path: "items" });
        expect(parseRepeat("order.lines as line")).toEqual({ path: "order.lines", alias: "line" });
        expect(parseRepeat("  items   as   item  ")).toEqual({ path: "items", alias: "item" });
        expect(parseRepeat("tasks")).toEqual({ path: "tasks" });
        expect(parseRepeat("")).toBeNull();
        expect(parseRepeat("   ")).toBeNull();
    });

    test("formats and parses condition expressions as opaque expressions", () => {
        expect(asCondition(" plan.visible ")).toBe("plan.visible");
        expect(parseCondition(" plan.status == 'active' ")).toBe("plan.status == 'active'");
        expect(parseCondition("")).toBeNull();
        expect(parseCondition("   ")).toBeNull();
    });

    test("exposes stable binding attribute names", () => {
        expect(CMS_BINDING_ATTRIBUTES).toEqual({
            condition: "cms-condition",
            repeat: "cms-repeat",
            source: "cms-source",
            slot: "cms-slot",
        });
    });
});
