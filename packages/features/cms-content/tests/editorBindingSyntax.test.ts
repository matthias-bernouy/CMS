import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG, CMS_BINDING_RUNTIME_ATTRIBUTES, CMS_SOURCE_SLOT_VALUES, CMS_SOURCE_STATES, applySourceState, asCondition, asInterpolation, asRepeat, asSource, clearBindingRuntimeState, isCmsSourceSlotValue, isCmsSourceState, isInterpolation, parseCondition, parseInterpolation, parseRepeat, parseSource, sourceStateFromElement } from "@bernouy/cms-content/editor";

describe("editor binding syntax", () => {
    function createElement(): Element {
        return parseHTML("<!DOCTYPE html><html><body><p></p></body></html>").document.querySelector("p")!;
    }
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
        expect(asSource({
            url: "/.cms/gateway/ban/search",
            alias: "addresses",
            params: {
                q: { from: "queryParam", name: "address" },
                delivery: { from: "state", name: "deliveryAddress" },
                limit: { from: "raw", value: 5 },
                type: { from: "raw", value: "housenumber street" },
                empty: { from: "raw", value: "" },
                skipped: undefined,
            },
        })).toBe("/.cms/gateway/ban/search?q=#{address}&delivery=@{deliveryAddress}&limit=5&type=housenumber%20street as addresses");
        expect(asSource({
            url: "/api/plans?",
            params: { q: { from: "raw", value: "hello" } },
        })).toBe("/api/plans?q=hello");
        expect(asSource({
            url: "/api/plans?existing=1#results",
            params: { q: { from: "queryParam", name: "search" } },
        })).toBe("/api/plans?existing=1&q=#{search}#results");
    });

    test("parses source bindings", () => {
        expect(parseSource(" {{BASE_PATH}}/api/plans ")).toEqual({ url: "{{BASE_PATH}}/api/plans" });
        expect(parseSource("/api/plans as plans")).toEqual({ url: "/api/plans", alias: "plans" });
        expect(parseSource("  /.cms/gateway/ban/search?q=#{address}&delivery=@{deliveryAddress}   as   addresses  "))
            .toEqual({ url: "/.cms/gateway/ban/search?q=#{address}&delivery=@{deliveryAddress}", alias: "addresses" });
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
        expect(CMS_BINDING_CORE_TAG).toBe("cms-binding-core");
        expect(CMS_BINDING_ATTRIBUTES).toEqual({
            bindingDisabled: "cms-binding-disabled",
            condition: "cms-condition",
            paramSync: "cms-param-sync",
            pageState: "cms-page-state",
            repeat: "cms-repeat",
            source: "cms-source",
            sourceStateForce: "cms-source-state-force",
            slot: "cms-slot",
        });
        expect(CMS_BINDING_RUNTIME_ATTRIBUTES).toEqual({ ready: "cms-ready" });
    });

    test("exposes stable source states and authored slot values", () => {
        expect(CMS_SOURCE_STATES).toEqual(["loaded", "loading", "empty", "error"]);
        expect(CMS_SOURCE_SLOT_VALUES).toEqual(["loading", "empty", "error"]);
        expect(isCmsSourceSlotValue("loading")).toBe(true);
        expect(isCmsSourceSlotValue("loaded")).toBe(false);
        expect(isCmsSourceSlotValue("unknown")).toBe(false);
        expect(isCmsSourceSlotValue(null)).toBe(false);
        expect(isCmsSourceState("loaded")).toBe(true);
        expect(isCmsSourceState("loading")).toBe(true);
        expect(isCmsSourceState("empty")).toBe(true);
        expect(isCmsSourceState("error")).toBe(true);
        expect(isCmsSourceState("disabled")).toBe(false);
        expect(isCmsSourceState(null)).toBe(false);
    });
    test("maps cms-slot attributes to logical source states", () => {
        const element = createElement();

        expect(sourceStateFromElement(element)).toBe("loaded");

        element.setAttribute("cms-slot", "empty");
        expect(sourceStateFromElement(element)).toBe("empty");

        element.setAttribute("cms-slot", "loaded");
        expect(sourceStateFromElement(element)).toBe("loaded");

        element.setAttribute("cms-slot", "invalid");
        expect(sourceStateFromElement(element)).toBe("loaded");
    });

    test("applies logical source states to authored cms-slot attributes", () => {
        const element = createElement();

        applySourceState(element, "loading");
        expect(element.getAttribute("cms-slot")).toBe("loading");

        applySourceState(element, "error");
        expect(element.getAttribute("cms-slot")).toBe("error");

        applySourceState(element, "loaded");
        expect(element.hasAttribute("cms-slot")).toBe(false);
    });

    test("clears binding runtime state from serialized content", () => {
        const { document } = parseHTML("<main cms-ready><section cms-source=\"/api\" cms-ready><p>Plan</p></section></main>");
        const content = document.querySelector("main")!;
        clearBindingRuntimeState(content);

        expect(content.hasAttribute("cms-ready")).toBe(false);
        expect(content.querySelector("[cms-source]")?.hasAttribute("cms-ready")).toBe(false);
        expect(content.querySelector("[cms-source]")?.getAttribute("cms-source")).toBe("/api");
    });
});
