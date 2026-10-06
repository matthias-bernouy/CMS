import { describe, expect, test } from "bun:test";
import {
    collectConditionReferences,
    compileCondition,
    evaluateCondition,
} from "../../../src/browser/binding/render/condition";
import type { Scope } from "../../../src/browser/binding/core/scope";

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
        expect(evaluateCondition('plan.status == "active" && plan.price > 0', scope)).toBe(true);
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
        console.warn = (...args: unknown[]) => {
            warnings.push(args);
        };
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
        expect(collectConditionReferences("result.ok && email.enabled == true")).toEqual([
            "result.ok",
            "email.enabled",
        ]);
        expect(collectConditionReferences("(result.ok)")).toEqual(["result.ok"]);
        expect(collectConditionReferences("result.items | contains(selection.id) && result.ready")).toEqual([
            "result.items",
            "selection.id",
            "result.ready",
        ]);
    });

    test("filter operands use registered functions, explicit argument paths and normal operator precedence", () => {
        const filters = {
            count: (value: unknown) => (Array.isArray(value) ? value.length : 0),
            includes: (value: unknown, item: unknown) => Array.isArray(value) && value.includes(item),
        };
        expect(evaluateCondition("items | count >= 2 && !plan.archived", scope, filters)).toBe(true);
        expect(evaluateCondition("!items | includes(plan.status)", scope, filters)).toBe(true);
        expect(evaluateCondition("items | includes(items.0)", scope, filters)).toBe(true);
        expect(evaluateCondition("missing | count == 0", scope, filters)).toBe(false);
        expect(evaluateCondition('plan.status | urlencode == "active"', scope)).toBe(true);
        for (const expression of [
            "items | unknown",
            "items | constructor",
            "items.map()",
            "items | includes()",
            "items | includes('a')",
            "items | count | count",
        ]) {
            expect(compileCondition(expression, filters).valid).toBe(false);
        }
    });
});
