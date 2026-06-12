import { describe, expect, test } from "bun:test";
import {
    CMS_BINDING_ATTRIBUTES,
    asInterpolation,
    isInterpolation,
    parseInterpolation,
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

    test("exposes stable binding attribute names", () => {
        expect(CMS_BINDING_ATTRIBUTES).toEqual({
            condition: "cms-condition",
            repeat: "cms-repeat",
            source: "cms-source",
            slot: "cms-slot",
        });
    });
});
