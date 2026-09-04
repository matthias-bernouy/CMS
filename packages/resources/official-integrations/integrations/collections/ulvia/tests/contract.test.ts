import { describe, expect, test } from "bun:test";
import {
    assertCollectionConformance,
    resolveCollectionSelection,
    type CollectionIntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("official source and collection boundaries", () => {
    test("publishes one complete Ulvia collection and backend-only sources", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definitions = (
            await Promise.all((await repository.list()).map(({ kind }) => repository.get(kind)))
        ).filter((definition) => definition !== null);
        const collections = definitions.filter(
            (definition): definition is CollectionIntegrationDefinition =>
                definition.schema === "cms.integration.definition.v2" && definition.type === "collection",
        );

        expect(collections.map(({ kind }) => kind)).toEqual(["ulvia"]);
        for (const definition of definitions) {
            expect(definition.schema).toBe("cms.integration.definition.v2");
            if (definition.type === "source") {
                expect(definition.theme).toBeUndefined();
                expect(definition.artifacts?.some(({ type }) => type === "bloc" || type === "dashboard")).toBe(false);
            }
        }

        const ulvia = collections[0]!;
        expect(ulvia.version).toBe("2.0.0");
        expect(ulvia.resources).toHaveLength(131);
        expect(new Set(ulvia.resources.map(({ id }) => id)).size).toBe(ulvia.resources.length);
        expect(ulvia.resources.every(({ id }) => id.startsWith("ulvia/blocs/"))).toBe(true);
        expect(
            ulvia.resources.every((resource) => !resource.theme || resource.theme.contract === "ulvia-theme@1"),
        ).toBe(true);
        expect(ulvia.artifacts?.every(({ type }) => type === "bloc")).toBe(true);

        const artifacts = new Set(
            ulvia.artifacts?.flatMap((artifact) => (artifact.type === "bloc" ? [artifact.bloc.tag] : [])),
        );
        const categories = new Set(ulvia.resourceCategories.map(({ id }) => id));
        for (const resource of ulvia.resources) {
            expect(artifacts.has(resource.artifact)).toBe(true);
            expect(categories.has(resource.category)).toBe(true);
        }
        expect(() => assertCollectionConformance(ulvia, definitions)).not.toThrow();

        const cta = ulvia.resources.find(({ id }) => id === "ulvia/blocs/basic-cta")!;
        expect(cta.requires?.resources).toContain("ulvia/blocs/basic-button");
        expect(
            resolveCollectionSelection(ulvia, [cta.id], undefined, definitions).effectiveResources[0]?.resources,
        ).toContain("ulvia/blocs/basic-button");
    });
});
