import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import { expectedRecipes } from "./background";
import { recipeOracle, verifyRecipePages } from "./oracle";
import type { RecipeRelease } from "./background";
import type { RegistryReadContext } from "../context";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareRecipeRead(
    context: RegistryReadContext,
    background: readonly RecipeRelease[],
    index: number,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const locale = index % 2 ? "fr" : "en";
    const input = { limit: 1, locale };
    const old = context.state.visible("collection", true)[0]!;
    const beforeRows = expectedRecipes(background, old, locale);
    assertCondition(
        beforeRows.length >= 2 && beforeRows[0]!.root.publisherId === context.state.scope.namespace,
        "registry-recipes-owned-fixture-order",
    );
    const prime = await context.read.call("bootstrap-recipes", "http", input, recipeOracle(beforeRows, 0, 1));
    assertCondition(prime.observation.validated, "registry-recipes-prime");
    const oldCursor = requireRecord(prime.output).cursor;
    const current = await context.state.publish("collection", 0, index + 1);
    const rows = expectedRecipes(background, current, locale);
    let freshCursor: unknown;
    return {
        async send() {
            return (
                await context.read.call("bootstrap-recipes", "http", input, (value) => {
                    recipeOracle(rows, 0, 1)(value);
                    freshCursor = requireRecord(value).cursor;
                })
            ).observation;
        },
        async verify() {
            const before = await context.state.refuseForeignMutation(context.foreign, current);
            for (const request of [
                { ...input, cursor: oldCursor },
                { ...input, cursor: freshCursor, locale: locale === "en" ? "fr" : "en" },
                { ...input, locale: "not_a_locale" },
            ]) {
                const refused = await context.read.call("bootstrap-recipes", "http", request);
                assertCondition(
                    !refused.observation.validated && refused.observation.status === 409,
                    "registry-recipes-stale-or-locale-cursor",
                );
            }
            await invalid(input);
            for (const selected of ["en", "fr"]) {
                await verifyRecipePages(context.read, expectedRecipes(background, current, selected), selected);
            }
            assertCondition(
                canonicalizeIJson(await context.state.snapshot([current])) === canonicalizeIJson(before),
                "registry-recipes-refusal-mutated-state",
            );
        },
    };
}
