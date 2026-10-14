import { describe, expect, test } from "bun:test";
import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    CMS_SOURCE_STATES,
    CMS_SOURCE_TRIGGERS,
    applySourceStatusCondition,
    applySourceStatusConditions,
    asCondition,
    asFieldCondition,
    asSourceStatusCondition,
    asSourceStatusConditions,
    clearSourceStatusCondition,
    isCmsSourceState,
    isCmsSourceTrigger,
    parseCondition,
    parseSourceStatusCondition,
    parseSourceStatusConditionDetails,
    parseSourceStatusConditions,
    sourceStatusConditionDetailsFromElement,
    sourceStatusConditionFromElement,
} from "@bernouy/cms-content/bindings";

describe("binding conditions", () => {
    test("formats and parses condition expressions with strict equality", () => {
        expect(asCondition(" plan.visible ")).toBe("plan.visible");
        expect(parseCondition(" plan.status === 'active' ")).toBe("plan.status === 'active'");
        expect(parseCondition("")).toBeNull();
        expect(parseCondition("   ")).toBeNull();
        expect(parseCondition("plan.status == 'active'")).toBeNull();
        expect(parseCondition("plan.status != 'draft'")).toBeNull();
        expect(parseCondition("plan.ready || (plan.selected && plan.available)")).toBe(
            "plan.ready || (plan.selected && plan.available)",
        );
        expect(parseCondition("plan.ready || (plan.selected && plan.available")).toBeNull();
    });

    test("formats field condition expressions", () => {
        expect(asFieldCondition(" . ")).toBe(".");
        expect(asFieldCondition(".", "falsy")).toBe("!.");
        expect(asFieldCondition(".", "equals", "active")).toBe('. === "active"');
        expect(asFieldCondition("plan.visible")).toBe("plan.visible");
        expect(asFieldCondition("plan.archived", "falsy")).toBe("!plan.archived");
        expect(asFieldCondition("plan.status", "equals", "active")).toBe('plan.status === "active"');
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
            condition: "cms-condition",
            formValueType: "cms-form-value-type",
            formEmpty: "cms-form-empty",
            query: "cms-query",
            queryInput: "cms-query-input",
            queryListen: "cms-query-listen",
            queryRefresh: "cms-query-refresh",
            repeat: "cms-repeat",
            source: "cms-source",
            sourceBody: "cms-source-body",
            sourceDelay: "cms-source-delay",
            sourceInheritQuery: "cms-source-inherit-query",
            sourceIdempotency: "cms-source-idempotency",
            sourceId: "cms-source-id",
            sourceMethod: "cms-source-method",
            sourceSerialization: "cms-source-serialization",
            sourceSuccessReload: "cms-source-success-reload",
            sourceSuccessRedirect: "cms-source-success-redirect",
            sourceSuccessRedirectParam: "cms-source-success-redirect-param",
            sourceSuccessReset: "cms-source-success-reset",
            sourceTrigger: "cms-source-trigger",
            sync: "cms-sync",
        });
    });

    test("exposes stable source states and triggers", () => {
        expect(CMS_SOURCE_STATES).toEqual(["loaded", "loading", "empty", "error"]);
        expect(CMS_SOURCE_TRIGGERS).toEqual(["submit", "change"]);
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
});

function createElement(): Element {
    return document.createElement("p");
}
