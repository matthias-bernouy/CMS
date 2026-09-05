import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    CMS_BINDING_RUNTIME_ATTRIBUTES,
    CMS_SOURCE_STATES,
    CMS_SOURCE_TRIGGERS,
    applySourceStatusCondition,
    applySourceStatusConditions,
    asCondition,
    asFieldCondition,
    asSourceStatusCondition,
    asSourceStatusConditions,
    clearBindingRuntimeState,
    clearSourceStatusCondition,
    isCmsSourceState,
    isCmsSourceTrigger,
    parseCondition,
    parseSourceStatusCondition,
    parseSourceStatusConditionDetails,
    parseSourceStatusConditions,
    sourceStatusConditionDetailsFromElement,
    sourceStatusConditionFromElement,
} from "@bernouy/cms-content/editor";

describe("editor binding conditions", () => {
    test("formats and parses condition expressions as opaque expressions", () => {
        expect(asCondition(" plan.visible ")).toBe("plan.visible");
        expect(parseCondition(" plan.status == 'active' ")).toBe("plan.status == 'active'");
        expect(parseCondition("")).toBeNull();
        expect(parseCondition("   ")).toBeNull();
    });

    test("formats field condition expressions", () => {
        expect(asFieldCondition("plan.visible")).toBe("plan.visible");
        expect(asFieldCondition("plan.archived", "falsy")).toBe("!plan.archived");
        expect(asFieldCondition("plan.status", "equals", "active")).toBe('plan.status == "active"');
        expect(asFieldCondition("items", "notEmpty")).toBe("items.length > 0");
    });

    test("formats and parses source status conditions", () => {
        const element = createElement();
        expect(asSourceStatusCondition("loading")).toBe("$source.loading");
        expect(asSourceStatusCondition("loading", "source-1")).toBe("$sources.source-1.loading");
        expect(
            asSourceStatusConditions([
                { sourceId: "source-1", state: "loading" },
                { sourceId: "source-2", state: "empty" },
            ]),
        ).toBe("$sources.source-1.loading || $sources.source-2.empty");
        expect(() => asSourceStatusCondition("loading", "bad id")).toThrow("Invalid source status id");
        expect(parseSourceStatusCondition(" $source.error ")).toBe("error");
        expect(parseSourceStatusCondition("$sources.source-1.error")).toBe("error");
        expect(parseSourceStatusConditionDetails("$sources.source-1.error")).toEqual({
            sourceId: "source-1",
            state: "error",
        });
        expect(parseSourceStatusConditions("$sources.source-1.loading || $sources.source-2.empty")).toEqual([
            { sourceId: "source-1", state: "loading" },
            { sourceId: "source-2", state: "empty" },
        ]);
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
            sourceSuccessRedirectParam: "cms-source-success-redirect-param",
            sourceSuccessReset: "cms-source-success-reset",
            sourceTrigger: "cms-source-trigger",
        });
        expect(CMS_BINDING_RUNTIME_ATTRIBUTES).toEqual({ ready: "cms-ready" });
    });

    test("exposes stable source states and triggers", () => {
        expect(CMS_SOURCE_STATES).toEqual(["loaded", "loading", "empty", "error"]);
        expect(CMS_SOURCE_TRIGGERS).toEqual(["auto", "submit", "change"]);
        for (const state of CMS_SOURCE_STATES) {
            expect(isCmsSourceState(state)).toBe(true);
        }
        expect(isCmsSourceState("disabled")).toBe(false);
        expect(isCmsSourceState(null)).toBe(false);
        for (const trigger of CMS_SOURCE_TRIGGERS) {
            expect(isCmsSourceTrigger(trigger)).toBe(true);
        }
        expect(isCmsSourceTrigger("manual")).toBe(false);
    });

    test("clears binding runtime state from serialized content", () => {
        const { document } = parseHTML(
            '<main cms-ready><section cms-source="/api" cms-ready><p>Plan</p></section></main>',
        );
        const content = document.querySelector("main")!;
        clearBindingRuntimeState(content);
        expect(content.hasAttribute("cms-ready")).toBe(false);
        expect(content.querySelector("[cms-source]")?.hasAttribute("cms-ready")).toBe(false);
        expect(content.querySelector("[cms-source]")?.getAttribute("cms-source")).toBe("/api");
    });
});

function createElement(): Element {
    return parseHTML("<!DOCTYPE html><html><body><p></p></body></html>").document.querySelector("p")!;
}
