import { describe, expect, test } from "bun:test";
import {
    asInterpolation,
    asRepeat,
    asSource,
    asSourceBody,
    isInterpolation,
    parseInterpolation,
    parseRepeat,
    parseSource,
    parseSourceBody,
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

    test("formats source bindings", () => {
        expect(asSource(" /api/plans ")).toBe("/api/plans");
        expect(asSource("https://example.com/api/plans")).toBe("https://example.com/api/plans");
        expect(asSource({ url: " /api/plans ", alias: " plans " })).toBe("/api/plans as plans");
        expect(
            asSource({
                url: "/.cms/sources/catalog/search",
                alias: "addresses",
                params: {
                    q: { from: "queryParam", name: "address" },
                    delivery: { from: "state", name: "deliveryAddress" },
                    limit: { from: "raw", value: 5 },
                    type: { from: "raw", value: "housenumber street" },
                    empty: { from: "raw", value: "" },
                    skipped: undefined,
                },
            }),
        ).toBe(
            "/.cms/sources/catalog/search?q=#{address}&delivery=@{deliveryAddress}&limit=5&type=housenumber%20street as addresses",
        );
        expect(asSource({ url: "/api/plans?", params: { q: { from: "raw", value: "hello" } } })).toBe(
            "/api/plans?q=hello",
        );
        expect(
            asSource({
                url: "/api/plans?existing=1#results",
                params: { q: { from: "queryParam", name: "search" } },
            }),
        ).toBe("/api/plans?existing=1&q=#{search}#results");
    });

    test("parses source bindings", () => {
        expect(parseSource(" {{BASE_PATH}}/api/plans ")).toEqual({ url: "{{BASE_PATH}}/api/plans" });
        expect(parseSource("/api/plans as plans")).toEqual({ url: "/api/plans", alias: "plans" });
        expect(
            parseSource("  /.cms/sources/catalog/search?q=#{address}&delivery=@{deliveryAddress}   as   addresses  "),
        ).toEqual({ url: "/.cms/sources/catalog/search?q=#{address}&delivery=@{deliveryAddress}", alias: "addresses" });
        expect(parseSource("")).toBeNull();
        expect(parseSource("   ")).toBeNull();
    });

    test("formats and parses source body bindings", () => {
        const body = {
            email: { from: "queryParam" as const, name: "email" },
            token: { from: "state" as const, name: "auth.token" },
            active: { from: "raw" as const, value: true },
            count: { from: "raw" as const, value: 2 },
            label: { from: "raw" as const, value: "Newsletter" },
            skipped: undefined,
        };
        const formatted = asSourceBody(body);
        const expected = {
            email: { from: "queryParam", name: "email" },
            token: { from: "state", name: "auth.token" },
            active: { from: "raw", value: true },
            count: { from: "raw", value: 2 },
            label: { from: "raw", value: "Newsletter" },
        };
        expect(JSON.parse(formatted)).toEqual(expected);
        expect(parseSourceBody(formatted)).toEqual(expected);
        expect(parseSourceBody("")).toBeNull();
        expect(parseSourceBody("{bad")).toBeNull();
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
});
