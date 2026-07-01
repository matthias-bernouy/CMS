import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG, CMS_BINDING_RUNTIME_ATTRIBUTES, CMS_SOURCE_STATES, CMS_SOURCE_TRIGGERS, applySourceStatusCondition, applySourceStatusConditions, asCondition, asInterpolation, asRepeat, asSource, asSourceBody, asSourceStatusCondition, asSourceStatusConditions, clearBindingRuntimeState, clearSourceStatusCondition, isCmsSourceState, isCmsSourceTrigger, isInterpolation, parseCondition, parseInterpolation, parseRepeat, parseSource, parseSourceBody, parseSourceStatusCondition, parseSourceStatusConditionDetails, parseSourceStatusConditions, sourceStatusConditionDetailsFromElement, sourceStatusConditionFromElement } from "@bernouy/cms-content/editor";

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
        })).toBe("/.cms/sources/catalog/search?q=#{address}&delivery=@{deliveryAddress}&limit=5&type=housenumber%20street as addresses");
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
        expect(parseSource("  /.cms/sources/catalog/search?q=#{address}&delivery=@{deliveryAddress}   as   addresses  "))
            .toEqual({ url: "/.cms/sources/catalog/search?q=#{address}&delivery=@{deliveryAddress}", alias: "addresses" });
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

        expect(JSON.parse(formatted)).toEqual({
            email: { from: "queryParam", name: "email" },
            token: { from: "state", name: "auth.token" },
            active: { from: "raw", value: true },
            count: { from: "raw", value: 2 },
            label: { from: "raw", value: "Newsletter" },
        });
        expect(parseSourceBody(formatted)).toEqual({
            email: { from: "queryParam", name: "email" },
            token: { from: "state", name: "auth.token" },
            active: { from: "raw", value: true },
            count: { from: "raw", value: 2 },
            label: { from: "raw", value: "Newsletter" },
        });
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

    test("formats and parses condition expressions as opaque expressions", () => {
        expect(asCondition(" plan.visible ")).toBe("plan.visible");
        expect(parseCondition(" plan.status == 'active' ")).toBe("plan.status == 'active'");
        expect(parseCondition("")).toBeNull();
        expect(parseCondition("   ")).toBeNull();
    });

    test("formats and parses source status conditions", () => {
        const element = createElement();

        expect(asSourceStatusCondition("loading")).toBe("$source.loading");
        expect(asSourceStatusCondition("loading", "source-1")).toBe("$sources.source-1.loading");
        expect(asSourceStatusConditions([{ sourceId: "source-1", state: "loading" }, { sourceId: "source-2", state: "empty" }]))
            .toBe("$sources.source-1.loading || $sources.source-2.empty");
        expect(() => asSourceStatusCondition("loading", "bad id")).toThrow("Invalid source status id");
        expect(parseSourceStatusCondition(" $source.error ")).toBe("error");
        expect(parseSourceStatusCondition("$sources.source-1.error")).toBe("error");
        expect(parseSourceStatusConditionDetails("$sources.source-1.error")).toEqual({ sourceId: "source-1", state: "error" });
        expect(parseSourceStatusConditions("$sources.source-1.loading || $sources.source-2.empty"))
            .toEqual([{ sourceId: "source-1", state: "loading" }, { sourceId: "source-2", state: "empty" }]);
        expect(parseSourceStatusCondition("$source.unknown")).toBeNull();

        applySourceStatusCondition(element, "empty", "plans");
        expect(element.getAttribute("cms-condition")).toBe("$sources.plans.empty");
        expect(sourceStatusConditionFromElement(element)).toBe("empty");
        expect(sourceStatusConditionDetailsFromElement(element)).toEqual({ sourceId: "plans", state: "empty" });

        clearSourceStatusCondition(element);
        expect(element.hasAttribute("cms-condition")).toBe(false);

        applySourceStatusConditions(element, []);
        expect(element.hasAttribute("cms-condition")).toBe(false);
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
            sourceBody: "cms-source-body",
            sourceId: "cms-source-id",
            sourceMethod: "cms-source-method",
            sourcePublish: "cms-source-publish",
            sourceStateForce: "cms-source-state-force",
            sourceSuccessRedirect: "cms-source-success-redirect",
            sourceSuccessReset: "cms-source-success-reset",
            sourceTrigger: "cms-source-trigger",
        });
        expect(CMS_BINDING_RUNTIME_ATTRIBUTES).toEqual({ ready: "cms-ready" });
    });

    test("exposes stable source states and triggers", () => {
        expect(CMS_SOURCE_STATES).toEqual(["loaded", "loading", "empty", "error"]);
        expect(CMS_SOURCE_TRIGGERS).toEqual(["auto", "submit"]);
        expect(isCmsSourceState("loaded")).toBe(true);
        expect(isCmsSourceState("loading")).toBe(true);
        expect(isCmsSourceState("empty")).toBe(true);
        expect(isCmsSourceState("error")).toBe(true);
        expect(isCmsSourceState("disabled")).toBe(false);
        expect(isCmsSourceState(null)).toBe(false);
        expect(isCmsSourceTrigger("auto")).toBe(true);
        expect(isCmsSourceTrigger("submit")).toBe(true);
        expect(isCmsSourceTrigger("manual")).toBe(false);
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
