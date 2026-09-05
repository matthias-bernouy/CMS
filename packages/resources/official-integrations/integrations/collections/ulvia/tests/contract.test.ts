import { describe, expect, test } from "bun:test";
import {
    assertCollectionConformance,
    type CollectionIntegrationDefinition,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Ulvia theme foundation 1.0.0", () => {
    test("publishes a theme contract without owning presentation resources", async () => {
        const { definitions, ulvia } = await catalogue();

        expect(ulvia.version).toBe("1.0.0");
        expect(ulvia.resources).toEqual([]);
        expect(ulvia.resourceCategories).toEqual([]);
        expect(ulvia.artifacts).toEqual([]);
        expect(() => assertCollectionConformance(ulvia, definitions)).not.toThrow();
    });

    test("keeps one unique, reusable public token namespace", async () => {
        const { ulvia } = await catalogue();
        const categories = ulvia.theme?.categories ?? [];
        const tokens = categories.flatMap(({ tokens }) => tokens);
        const tokenIds = tokens.map(({ id }) => id);

        expect(categories.map(({ id }) => id)).toEqual([
            "brand",
            "feedback",
            "spacing-and-width",
            "shape-and-motion",
            "surfaces",
            "typography",
        ]);
        expect(tokens).toHaveLength(55);
        expect(new Set(categories.map(({ id }) => id)).size).toBe(categories.length);
        expect(new Set(tokenIds).size).toBe(tokenIds.length);
        expect(tokenIds).toEqual(
            expect.arrayContaining([
                "primary-base",
                "danger-base",
                "surface-background",
                "surface-text",
                "surface-border",
                "font-body",
                "space-md",
                "radius-card",
                "shadow-soft",
            ]),
        );
        expect(tokens.every(({ defaults }) => typeof defaults.light === "string" && defaults.light.length > 0)).toBe(
            true,
        );
    });
});

async function catalogue(): Promise<{
    definitions: IntegrationDefinition[];
    ulvia: CollectionIntegrationDefinition;
}> {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const definitions = (await Promise.all((await repository.list()).map(({ kind }) => repository.get(kind)))).filter(
        (definition): definition is IntegrationDefinition => definition !== null,
    );
    const ulvia = definitions.find(
        (definition): definition is CollectionIntegrationDefinition =>
            definition.schema === "cms.integration.definition.v2" &&
            definition.type === "collection" &&
            definition.kind === "ulvia",
    );
    if (!ulvia) {
        throw new Error("Ulvia collection definition not found");
    }
    return { definitions, ulvia };
}
