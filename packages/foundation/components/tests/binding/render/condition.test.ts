import { describe, expect, test } from "bun:test";
import { collectConditionReferences, compileCondition, evaluateCondition } from "../../../src/binding/render/condition";
import type { Scope } from "../../../src/binding/scope";

const scope: Scope = {
    value: {
        plan: { visible: true, archived: false, status: "active", price: 12, stock: 0 },
        items: ["a", "b"],
    },
    vars: {
        $source: { loaded: true, error: false },
        $sources: { products: { empty: false, error: false } },
    },
};

describe("cms-condition evaluator", () => {
    test("preserves truthy and falsy path conditions", () => {
        expect(evaluateCondition("plan.visible", scope)).toBe(true);
        expect(evaluateCondition("!plan.archived", scope)).toBe(true);
        expect(evaluateCondition("missing.path", scope)).toBe(false);
    });

    test("supports boolean combinations and comparisons", () => {
        expect(evaluateCondition("plan.status == \"active\" && plan.price > 0", scope)).toBe(true);
        expect(evaluateCondition("plan.status != 'draft' && items.length >= 2", scope)).toBe(true);
        expect(evaluateCondition("plan.stock == 0 || $sources.products.error", scope)).toBe(true);
        expect(evaluateCondition("plan.price < 10", scope)).toBe(false);
    });

    test("keeps source state paths as normal condition paths", () => {
        expect(evaluateCondition("$source.loaded && !$source.error", scope)).toBe(true);
        expect(evaluateCondition("$sources.products.empty || $sources.products.error", scope)).toBe(false);
    });

    test("invalid expressions compile to false and warn once", () => {
        const warnings: unknown[][] = [];
        const warn = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(args); };
        try {
            const condition = compileCondition("(plan.visible)");
            expect(condition.valid).toBe(false);
            expect(condition.evaluate(scope)).toBe(false);
            expect(condition.evaluate(scope)).toBe(false);
        } finally {
            console.warn = warn;
        }
        expect(warnings).toHaveLength(1);
    });

    test("collects path references from valid and invalid expressions", () => {
        expect(collectConditionReferences("result.ok && email.enabled == true")).toEqual(["result.ok", "email.enabled"]);
        expect(collectConditionReferences("(result.ok)")).toEqual(["result.ok"]);
    });
});
