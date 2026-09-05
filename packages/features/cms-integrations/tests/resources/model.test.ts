import { describe, expect, test } from "bun:test";
import {
    assertCollectionConformance,
    assertSourceCanBeRemoved,
    collectionResourceIdsForCategories,
    parseIntegrationDefinition,
    resolveCollectionSelection,
    sourceRemovalBlockers,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import { collectionDefinition, sourceDefinition } from "./fixtures";

describe("integration resource model", () => {
    test("parses the two current definition types and versions source endpoint contracts", () => {
        const source = sourceDefinition();
        expect(source.type).toBe("source");
        const artifact = source.artifacts?.find((candidate) => candidate.type === "source");
        expect(artifact?.source.endpoints[0]?.contractVersion).toBe("1.0.0");

        const collection = collectionDefinition();
        expect(collection.type).toBe("collection");
        expect(collection.resources.map(({ id }) => id)).toEqual([
            "ulvia/blocs/basic-paragraph",
            "ulvia/blocs/commerce-offer-list",
        ]);
    });

    test("rejects mixed source and UI responsibilities", () => {
        expect(() =>
            parseIntegrationDefinition({
                schema: "cms.integration.definition.v2",
                type: "source",
                kind: "mixed",
                label: "Mixed",
                version: "1.0.0",
                inputs: [],
                artifacts: [{ type: "bloc", bloc: { tag: "mixed-card", name: "Card", compositionHTML: "<p></p>" } }],
            }),
        ).toThrow(/cannot publish blocs or dashboards/);
        expect(() =>
            collectionDefinition({
                artifacts: [
                    {
                        type: "source",
                        endpointContractVersion: "1.0.0",
                        source: { id: "mixed", meta: { name: "Mixed" }, endpoints: [] },
                    },
                ],
            }),
        ).toThrow(/can publish only blocs/);
    });

    test("rejects integration artifacts that claim a native HTML root", () => {
        expect(() =>
            collectionDefinition({
                resources: [
                    {
                        id: "ulvia/blocs/paragraph",
                        type: "bloc",
                        artifact: "p",
                        category: "content",
                    },
                ],
                artifacts: [
                    {
                        type: "bloc",
                        bloc: { tag: "p", name: "Paragraph", compositionHTML: "<p></p>" },
                    },
                ],
            }),
        ).toThrow(/native HTML tag "p" is platform-owned/);
    });

    test("rejects collection bloc artifacts outside the collection namespace", () => {
        expect(() =>
            collectionDefinition({
                resources: [
                    {
                        id: "ulvia/blocs/card",
                        type: "bloc",
                        artifact: "foreign-card",
                        category: "content",
                    },
                ],
                artifacts: [
                    {
                        type: "bloc",
                        bloc: { tag: "foreign-card", name: "Card", compositionHTML: "<article></article>" },
                    },
                ],
            }),
        ).toThrow(/definition\.resources\.0\.artifact.*must use the namespace ulvia-<id>/);
    });

    test("lets sources publish reusable dashboard views but not site dashboard compositions", () => {
        const source = parseIntegrationDefinition({
            schema: "cms.integration.definition.v2",
            type: "source",
            kind: "catalog",
            label: "Catalog",
            version: "1.0.0",
            inputs: [],
            artifacts: [
                {
                    type: "dashboard-view",
                    view: {
                        schemaVersion: 2,
                        id: "catalog-products",
                        source: "catalog",
                        meta: { name: "Products" },
                        view: { id: "products", label: "Products", widgets: [] },
                        availability: { catalog: true, defaultPlacement: { dashboardId: "catalog" } },
                    },
                },
            ],
        });
        expect(source.artifacts?.map((artifact) => artifact.type)).toEqual(["dashboard-view"]);

        expect(() =>
            parseIntegrationDefinition({
                schema: "cms.integration.definition.v2",
                type: "source",
                kind: "catalog",
                label: "Catalog",
                version: "1.0.0",
                inputs: [],
                artifacts: [
                    {
                        type: "dashboard",
                        dashboard: {
                            schemaVersion: 2,
                            id: "catalog",
                            meta: { name: "Catalog" },
                            homeView: "products",
                            views: [],
                            status: "published",
                        },
                    },
                ],
            }),
        ).toThrow(/cannot publish blocs or dashboards/);
    });

    test("preserves active resources on upgrade and leaves additions inactive", () => {
        const collection = collectionDefinition();
        expect(resolveCollectionSelection(collection)).toEqual({
            activeResources: ["ulvia/blocs/basic-paragraph"],
            effectiveResources: [{ kind: "ulvia", resources: ["ulvia/blocs/basic-paragraph"] }],
            requiredCollections: [],
            requiredSources: [],
        });
        expect(resolveCollectionSelection(collection, undefined, ["ulvia/blocs/basic-paragraph"])).toEqual({
            activeResources: ["ulvia/blocs/basic-paragraph"],
            effectiveResources: [{ kind: "ulvia", resources: ["ulvia/blocs/basic-paragraph"] }],
            requiredCollections: [],
            requiredSources: [],
        });
        expect(resolveCollectionSelection(collection, ["ulvia/blocs/commerce-offer-list"])).toEqual({
            activeResources: ["ulvia/blocs/commerce-offer-list"],
            effectiveResources: [{ kind: "ulvia", resources: ["ulvia/blocs/commerce-offer-list"] }],
            requiredCollections: [],
            requiredSources: [{ kind: "commerce", versionRange: "^3.0.0" }],
        });
        expect(collectionResourceIdsForCategories(collection, ["commerce"])).toEqual([
            "ulvia/blocs/commerce-offer-list",
        ]);
    });

    test("resolves same-collection and cross-collection resources transitively", () => {
        const ulvia = collectionDefinition({
            resources: collectionDefinition().resources.map((resource) =>
                resource.id === "ulvia/blocs/basic-paragraph"
                    ? { ...resource, requires: { resources: ["ulvia/blocs/commerce-offer-list"] } }
                    : resource,
            ),
        });
        const client = clientCollection();
        const selection = resolveCollectionSelection(client, ["client/blocs/feature"], undefined, [
            client,
            ulvia,
            sourceDefinition(),
        ]);

        expect(selection).toEqual({
            activeResources: ["client/blocs/feature"],
            effectiveResources: [
                { kind: "client", resources: ["client/blocs/feature"] },
                {
                    kind: "ulvia",
                    resources: ["ulvia/blocs/basic-paragraph", "ulvia/blocs/commerce-offer-list"],
                },
            ],
            requiredCollections: [{ kind: "ulvia", version: "1.0.0", resources: ["ulvia/blocs/basic-paragraph"] }],
            requiredSources: [{ kind: "commerce", versionRange: "^3.0.0" }],
        });
    });

    test("rejects unavailable resources required from another collection", () => {
        const client = clientCollection("ulvia/blocs/missing");
        expect(() =>
            resolveCollectionSelection(client, ["client/blocs/feature"], undefined, [client, collectionDefinition()]),
        ).toThrow(/required collection resource "ulvia\/blocs\/missing" is unavailable/);
    });

    test("keeps internal controller blocs out of author resource selections", () => {
        const base = collectionDefinition();
        const collection = collectionDefinition({
            resources: [
                ...base.resources,
                {
                    id: "ulvia/blocs/commerce-offer-list-controller",
                    type: "bloc",
                    artifact: "ulvia-commerce-offer-list-controller",
                    category: "commerce",
                },
            ],
            artifacts: [
                ...(base.artifacts ?? []),
                {
                    type: "bloc",
                    bloc: {
                        tag: "ulvia-commerce-offer-list-controller",
                        name: "Offer list controller",
                        internal: true,
                        viewJS: "customElements.define('ulvia-commerce-offer-list-controller', class extends HTMLElement {})",
                    },
                },
            ],
        });

        expect(collectionResourceIdsForCategories(collection, ["commerce"])).toEqual([
            "ulvia/blocs/commerce-offer-list",
        ]);
        expect(() => resolveCollectionSelection(collection, ["ulvia/blocs/commerce-offer-list-controller"])).toThrow(
            /unknown collection resources/,
        );
    });

    test("detects removed active resources instead of silently breaking pages", () => {
        const collection = collectionDefinition({
            resources: [
                {
                    id: "ulvia/blocs/basic-paragraph",
                    type: "bloc",
                    artifact: "ulvia-basic-paragraph",
                    category: "content",
                },
            ],
            artifacts: [
                {
                    type: "bloc",
                    bloc: { tag: "ulvia-basic-paragraph", name: "Paragraph", compositionHTML: "<p></p>" },
                },
            ],
        });
        expect(() => resolveCollectionSelection(collection, undefined, ["ulvia/blocs/commerce-offer-list"])).toThrow(
            /active collection resources were removed/,
        );
    });

    test("blocks removing a source used by an active collection resource", () => {
        const installation = collectionInstallation(["ulvia/blocs/commerce-offer-list"]);
        expect(sourceRemovalBlockers("commerce", [installation])).toEqual([
            {
                collection: "ulvia",
                resources: ["ulvia/blocs/commerce-offer-list"],
            },
        ]);
        expect(() => assertSourceCanBeRemoved("commerce", [installation])).toThrow(
            /active collection resources depend on it/,
        );

        installation.activeResources = ["ulvia/blocs/basic-paragraph"];
        expect(() => assertSourceCanBeRemoved("commerce", [installation])).not.toThrow();
    });

    test("blocks source removal through an inactive required resource", () => {
        const definition = collectionDefinition({
            resources: collectionDefinition().resources.map((resource) =>
                resource.id === "ulvia/blocs/basic-paragraph"
                    ? { ...resource, requires: { resources: ["ulvia/blocs/commerce-offer-list"] } }
                    : resource,
            ),
        });
        const installation = collectionInstallation(["ulvia/blocs/basic-paragraph"]);
        installation.definitionSnapshot = definition;

        expect(sourceRemovalBlockers("commerce", [installation])).toEqual([
            { collection: "ulvia", resources: ["ulvia/blocs/commerce-offer-list"] },
        ]);
    });

    test("validates source, endpoint, input/output and theme contracts end to end", () => {
        const collection = collectionDefinition();
        expect(() => assertCollectionConformance(collection, [sourceDefinition()])).not.toThrow();

        const missing = collectionDefinition({
            resources: collection.resources.map((resource) =>
                resource.id.endsWith("commerce-offer-list")
                    ? {
                          ...resource,
                          endpoints: [{ ...resource.endpoints![0], endpoint: "urn:commerce:missing" }],
                      }
                    : resource,
            ),
        });
        expect(() => assertCollectionConformance(missing, [sourceDefinition()])).toThrow(/missing endpoint/);

        const invalidBinding = collectionDefinition({
            resources: collection.resources.map((resource) =>
                resource.id.endsWith("commerce-offer-list")
                    ? { ...resource, endpoints: [{ ...resource.endpoints![0], bindings: undefined }] }
                    : resource,
            ),
        });
        const strictSource = sourceDefinition();
        const strictArtifact = strictSource.artifacts?.find((artifact) => artifact.type === "source");
        if (!strictArtifact || strictArtifact.type !== "source") {
            throw new Error("Missing source fixture");
        }
        strictArtifact.source.endpoints[0]!.params[0]!.required = true;
        expect(() => assertCollectionConformance(invalidBinding, [strictSource])).toThrow(
            /missing required input bindings: params.page/,
        );
    });

    test("validates only selected resources while retaining their internal requirements", () => {
        const collection = collectionDefinition();
        const source = sourceDefinition();
        source.version = "4.0.0";

        expect(() => assertCollectionConformance(collection, [source], ["ulvia/blocs/basic-paragraph"])).not.toThrow();
        expect(() => assertCollectionConformance(collection, [source], ["ulvia/blocs/commerce-offer-list"])).toThrow(
            /requires source "commerce" version \^3\.0\.0, got 4\.0\.0/,
        );
    });

    test("matches authoring endpoints whose runtime source id is configured during installation", () => {
        const source = sourceDefinition();
        const sourceArtifact = source.artifacts?.find((artifact) => artifact.type === "source");
        if (!sourceArtifact || sourceArtifact.type !== "source") {
            throw new Error("Missing source fixture");
        }
        sourceArtifact.source.id = "{{answers.id}}";

        expect(() => assertCollectionConformance(collectionDefinition(), [source])).not.toThrow();
    });

    test("validates versioned system function endpoints owned by a source package", () => {
        const source = sourceDefinition();
        source.artifacts?.push({
            type: "function",
            contractVersion: "1.0.0",
            function: {
                id: "checkout",
                method: "POST",
                input: { params: { orderId: { type: "number" } } },
                output: [{ status: "200", body: { type: "object", properties: { ok: { type: "boolean" } } } }],
                steps: [],
                return: { status: 200 },
            },
        });
        const collection = collectionDefinition();
        collection.resources[1]!.endpoints = [
            {
                source: "commerce",
                sourceVersion: "^3.0.0",
                endpoint: "urn:system-functions:checkout",
                contractVersion: "^1.0.0",
                bindings: {
                    input: { "params.orderId": "props.orderId" },
                    output: { "state.ok": "200.body.ok" },
                },
            },
        ];

        expect(() => assertCollectionConformance(collection, [source])).not.toThrow();
    });

    test("lets a collection consume declared provider theme tokens directly", () => {
        const ulvia = collectionDefinition({ version: "3.0.0" });
        const previousUlvia = collectionDefinition({ version: "2.1.0" });
        const client = clientCollection();
        client.theme = {
            dependencies: [{ kind: "ulvia", versionRange: "^3.0.0" }],
            categories: [],
        };
        client.resources[0]!.requires!.collections![0]!.versionRange = "^3.0.0";
        client.resources[0]!.theme = {
            contract: "ulvia-theme@2",
            required: ["surface-background"],
        };

        expect(() =>
            assertCollectionConformance(client, [client, ulvia, previousUlvia, sourceDefinition()]),
        ).not.toThrow();

        client.resources[0]!.theme.required = ["missing-token"];
        expect(() => assertCollectionConformance(client, [client, ulvia, previousUlvia, sourceDefinition()])).toThrow(
            'references missing theme token "missing-token"',
        );
    });

    test("keeps site variables out of published collection theme defaults", () => {
        const collection = collectionDefinition();
        collection.theme!.categories[0]!.tokens.push({
            id: "local-alias",
            label: "Local alias",
            type: "color",
            defaults: { light: "var(--site-campaign-accent)" },
        });

        expect(() => assertCollectionConformance(collection, [collection, sourceDefinition()])).toThrow(
            'published theme token cannot depend on site variable "site-campaign-accent"',
        );
    });
});

function collectionInstallation(activeResources: string[]): IntegrationInstallation {
    return {
        id: "ulvia",
        label: "Ulvia",
        definitionVersion: "1.0.0",
        definitionSnapshot: collectionDefinition(),
        status: "success",
        createdAt: new Date("2026-09-04T00:00:00.000Z"),
        updatedAt: new Date("2026-09-04T00:00:00.000Z"),
        runCount: 1,
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [],
        activeResources,
        runs: [],
    };
}

function clientCollection(resource = "ulvia/blocs/basic-paragraph") {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "collection",
        kind: "client",
        label: "Client",
        version: "1.0.0",
        inputs: [],
        resourceCategories: [{ id: "content", label: "Content" }],
        resources: [
            {
                id: "client/blocs/feature",
                type: "bloc",
                artifact: "client-feature",
                category: "content",
                requires: {
                    collections: [{ kind: "ulvia", versionRange: "^1.0.0", resources: [resource] }],
                },
            },
        ],
        artifacts: [
            {
                type: "bloc",
                bloc: {
                    tag: "client-feature",
                    name: "Feature",
                    compositionHTML: "<ulvia-basic-paragraph></ulvia-basic-paragraph>",
                },
            },
        ],
    });
}
