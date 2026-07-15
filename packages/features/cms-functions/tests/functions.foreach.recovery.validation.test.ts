import { describe, expect, test } from "bun:test";
import { validateFunction, type CmsFunction } from "@bernouy/cms-functions";
import {
    productCall,
    productSources,
    recoveringProductsFunction,
    recoveryLoop,
} from "./helpers/foreachRecoveryFixtures";

describe("cms functions foreach recovery validation", () => {
    test("accepts recovery references from their own branch", async () => {
        const sources = await productSources();

        expect(await validateFunction(recoveringProductsFunction(), { sources })).toEqual([]);
    });

    test("requires an explicit and complete recovery policy", async () => {
        const sources = await productSources();
        const invalidFlag = recoveringProductsFunction();
        recoveryLoop(invalidFlag).continueOnError = "yes" as unknown as boolean;
        const missingSteps = recoveringProductsFunction();
        delete recoveryLoop(missingSteps).onError;
        const unexpectedSteps = recoveringProductsFunction();
        delete recoveryLoop(unexpectedSteps).continueOnError;
        const unexpectedYield = recoveringProductsFunction();
        const unexpectedYieldLoop = recoveryLoop(unexpectedYield);
        delete unexpectedYieldLoop.continueOnError;
        delete unexpectedYieldLoop.onError;

        expect(await validateFunction(invalidFlag, { sources })).toContain(
            "function.steps.0.forEach.continueOnError must be a boolean",
        );
        expect(await validateFunction(missingSteps, { sources })).toContain(
            "function.steps.0.forEach.onError must be a non-empty array when continueOnError is true",
        );
        expect(await validateFunction(unexpectedSteps, { sources })).toContain(
            "function.steps.0.forEach.onError requires continueOnError to be true",
        );
        expect(await validateFunction(unexpectedYield, { sources })).toContain(
            "function.steps.0.forEach.errorYield requires continueOnError to be true",
        );
    });

    test("keeps success-only step results out of errorYield", async () => {
        const sources = await productSources();
        const fn = recoveringProductsFunction();
        recoveryLoop(fn).errorYield = "$steps.product.id";

        expect(await validateFunction(fn, { sources })).toContain(
            'function.steps.0.forEach.errorYield references unknown or future step "product"',
        );
    });

    test("counts normal and recovery calls in the worst-case budget", async () => {
        const sources = await productSources();
        const withinBudget = continuingLoop(16);
        const overBudget = continuingLoop(17);

        expect(await validateFunction(withinBudget, { sources })).toEqual([]);
        expect(await validateFunction(overBudget, { sources })).toContain(
            "function call budget exceeds max (51, max 50)",
        );
    });

    test("enforces GET purity in the recovery branch", async () => {
        const sources = await productSources();
        const fn = recoveringProductsFunction();
        recoveryLoop(fn).onError = [{
            id: "recover",
            call: {
                source: "products",
                endpoint: "updateProduct",
                params: { productId: "$item.id" },
                body: { title: "Recovery" },
            },
        }];

        expect(await validateFunction(fn, { sources })).toContain(
            "function.steps.0.forEach.onError.0.call cannot call POST from a GET function",
        );
    });

    test("shares the absolute iteration limit with runtime execution", async () => {
        const sources = await productSources();
        const maximum = recoveringProductsFunction();
        recoveryLoop(maximum).max = 50;
        const tooLarge = recoveringProductsFunction();
        recoveryLoop(tooLarge).max = 51;

        expect(await validateFunction(maximum, { sources, maxCalls: 100 })).toEqual([]);
        expect(await validateFunction(tooLarge, { sources, maxCalls: 102 })).toContain(
            "function.steps.0.forEach.max must be an integer between 1 and 50",
        );
    });
});

function continuingLoop(max: number): CmsFunction {
    const fn = recoveringProductsFunction([{ id: "p1", recoveryId: "r1" }]);
    const loop = recoveryLoop(fn);
    loop.max = max;
    loop.steps = [
        { id: "first", call: productCall("$item.id") },
        { id: "second", call: productCall("$item.id") },
    ];
    loop.yield = "$steps.second";
    return fn;
}
