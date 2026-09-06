import { expect, test } from "bun:test";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { buildIntegrationCatalogue } from "cms-control/core/management/integrations/presentation/catalogue";
const source: IntegrationDefinition = {
    schema: "cms.integration.definition.v2",
    type: "source",
    kind: "source",
    label: "Source",
    version: "1.0.0",
    inputs: [],
};
const extension: IntegrationDefinition = {
    ...source,
    kind: "extension",
    extensionOf: { kind: "source" },
    dependencies: [{ name: "parent", kind: "source", versionRange: "^1.0.0" }],
};
const collection: IntegrationDefinition = {
    ...source,
    type: "collection",
    artifacts: [],
    kind: "collection",
    resourceCategories: [],
    resources: [],
};
test("separates source and bloc catalogues and requires a compatible installed extension parent", () => {
    const input = {
        definitions: [source, extension, collection],
        installations: [],
        query: "",
        category: "",
        basePath: "/cms",
    };
    expect(buildIntegrationCatalogue({ ...input, scope: "sources" }).items.map(({ kind }) => kind)).toEqual(["source"]);
    expect(buildIntegrationCatalogue({ ...input, scope: "collections" }).items.map(({ kind }) => kind)).toEqual([
        "collection",
    ]);
    expect(
        buildIntegrationCatalogue({
            ...input,
            scope: "sources",
            installations: [{ id: "source", status: "success", definitionVersion: "1.2.0" }],
        }).items.map(({ kind }) => kind),
    ).toEqual(["extension"]);
    expect(
        buildIntegrationCatalogue({
            ...input,
            scope: "sources",
            installations: [{ id: "source", status: "success", definitionVersion: "2.0.0" }],
        }).items,
    ).toEqual([]);
});
