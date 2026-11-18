import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { expectedRecipes } from "./background";
import type { RegistryReadPorts } from "../metadata/types";

export function recipeOracle(expected: ReturnType<typeof expectedRecipes>, offset: number, limit: number) {
    return (value: unknown) => {
        const output = requireRecord(value);
        assertCondition(
            Object.keys(output).toSorted().join(",") === "cursor,items" &&
                canonicalizeIJson(output.items) === canonicalizeIJson(expected.slice(offset, offset + limit)),
            "registry-recipes-exact-projection",
        );
        assertCondition(
            typeof output.cursor === "string" &&
                (offset + limit < expected.length
                    ? /^[a-f0-9]{64}\/[0-9]+$/u.test(output.cursor)
                    : output.cursor === ""),
            "registry-recipes-pagination",
        );
    };
}

export async function verifyRecipePages(
    read: RegistryReadPorts,
    expected: ReturnType<typeof expectedRecipes>,
    locale: string,
) {
    let cursor = "";
    let offset = 0;
    for (let page = 0; page < 64; page++) {
        const value = await read.call(
            "bootstrap-recipes",
            "http",
            { limit: 64, locale, cursor },
            recipeOracle(expected, offset, 64),
        );
        assertCondition(value.observation.validated, "registry-recipes-complete-pagination");
        const output = requireRecord(value.output);
        offset += (output.items as unknown[]).length;
        cursor = String(output.cursor);
        if (!cursor) {
            assertCondition(offset === expected.length, "registry-recipes-complete-count");
            return;
        }
    }
    assertCondition(false, "registry-recipes-page-bound");
}
