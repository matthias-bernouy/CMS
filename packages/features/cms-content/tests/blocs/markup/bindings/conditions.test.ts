import { describe, expect, test } from "bun:test";
import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    asCondition,
    asFieldCondition,
    parseCondition,
    parseCase,
    parseMatch,
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

    test("parses generic matches and literal cases", () => {
        expect(parseMatch(" page.outcome.kind ")).toBe("page.outcome.kind");
        expect(parseMatch("page.outcome.kind === 'success'")).toBe("page.outcome.kind === 'success'");
        expect(parseCase("'success'")).toBe("success");
        expect(parseCase("42")).toBe(42);
        expect(parseCase("false")).toBe(false);
        expect(parseCase("null")).toBeNull();
        expect(parseCase("page.outcome.kind")).toBeUndefined();
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

    test("exposes stable binding attribute names", () => {
        expect(CMS_BINDING_CORE_TAG).toBe("cms-binding-core");
        expect(CMS_BINDING_ATTRIBUTES).toEqual({
            condition: "cms-condition",
            match: "cms-match",
            case: "cms-case",
            formValueType: "cms-form-value-type",
            formEmpty: "cms-form-empty",
            query: "cms-query",
            queries: "cms-queries",
            queryInput: "cms-query-input",
            queryListen: "cms-query-listen",
            queryRefresh: "cms-query-refresh",
            mutation: "cms-mutation",
            mutationInput: "cms-mutation-input",
            mutationRedirect: "cms-mutation-redirect",
            mutationRedirectParam: "cms-mutation-redirect-param",
            mutationReset: "cms-mutation-reset",
            repeat: "cms-repeat",
            sync: "cms-sync",
            syncSelect: "cms-sync-select",
        });
    });
});
