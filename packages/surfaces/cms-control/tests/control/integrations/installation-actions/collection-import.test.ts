import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import postIntegrationInstallationUpgrade from "cms-control/api/_platform/integrations/installations/upgrade.post";
import { makeCms, postImport, postUpgrade } from "../support/helpers";

describe("collection imports", () => {
    test("installs no source for a source-free selection", async () => {
        const fixture = collectionCms();
        const response = await postIntegrationImport(
            postImport({ kind: "ulvia", resources: ["ulvia/blocs/basic-paragraph"] }),
            fixture.cms,
        );

        expect(response.status).toBe(200);
        expect(await fixture.integrationInstallations.get("commerce")).toBeNull();
        expect((await fixture.integrationInstallations.get("ulvia"))?.activeResources).toEqual([
            "ulvia/blocs/basic-paragraph",
        ]);
        expect((await fixture.repository.getBlocsList()).map(({ id }) => id)).toEqual(["basic-paragraph"]);
        expect(await fixture.repository.getBlocViewJS("commerce-offer-list")).toBe("");
    });

    test("installs exactly the source required by an active bloc", async () => {
        const fixture = collectionCms();
        await postIntegrationImport(
            postImport({ kind: "ulvia", resources: ["ulvia/blocs/commerce-offer-list"] }),
            fixture.cms,
        );

        expect(await fixture.integrationInstallations.get("commerce")).not.toBeNull();
        expect(await fixture.sources.getSource("urn:commerce")).not.toBeNull();
        expect((await fixture.repository.getBlocsList()).map(({ id }) => id)).toEqual(["commerce-offer-list"]);
        expect(await fixture.repository.getBlocRecord("basic-paragraph")).not.toBeNull();
    });

    test("loads inactive source contracts for an upgrade without installing those sources", async () => {
        const fixture = collectionCms([collectionDefinition(), collectionDefinition("1.1.0")]);
        await postIntegrationImport(
            postImport({ kind: "ulvia", version: "1.0.0", resources: ["ulvia/blocs/basic-paragraph"] }),
            fixture.cms,
        );

        const response = await postIntegrationInstallationUpgrade(
            postUpgrade("ulvia", { version: "1.1.0" }),
            fixture.cms,
        );

        expect(response.status).toBe(200);
        expect((await fixture.integrationInstallations.get("ulvia"))?.definitionVersion).toBe("1.1.0");
        expect(await fixture.integrationInstallations.get("commerce")).toBeNull();
    });

    test("installs a required collection without exposing its support resources", async () => {
        const fixture = collectionCms([collectionDefinition(), clientCollectionDefinition()]);
        const response = await postIntegrationImport(
            postImport({ kind: "client", resources: ["client/blocs/feature"] }),
            fixture.cms,
        );

        expect(response.status).toBe(200);
        expect((await fixture.integrationInstallations.get("ulvia"))?.activeResources).toEqual([]);
        expect((await fixture.integrationInstallations.get("client"))?.activeResources).toEqual([
            "client/blocs/feature",
        ]);
        expect((await fixture.repository.getBlocsList()).map(({ id }) => id)).toEqual(["client-feature"]);
        expect(await fixture.repository.getBlocRecord("basic-paragraph")).not.toBeNull();
    });

    test("installs a collection declared as a top-level dependency for its theme", async () => {
        const fixture = collectionCms([collectionDefinition(), clientCollectionDefinition()]);

        const response = await postIntegrationImport(postImport({ kind: "client", resources: [] }), fixture.cms);

        expect(response.status).toBe(200);
        expect((await fixture.integrationInstallations.get("ulvia"))?.activeResources).toEqual([]);
        expect((await fixture.integrationInstallations.get("client"))?.activeResources).toEqual([]);
    });
});

function collectionCms(collections: IntegrationDefinition[] = [collectionDefinition()]) {
    const fixture = makeCms([sourceDefinition(), ...collections]);
    const repository = new InMemoryCmsRepository();
    fixture.cms.repository = repository;
    fixture.cms.integrationBlocRepository = repository;
    fixture.cms.config = {};
    return { ...fixture, repository };
}

function sourceDefinition(): IntegrationDefinition {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "source",
        kind: "commerce",
        label: "Commerce",
        version: "3.0.0",
        inputs: [],
        artifacts: [
            {
                type: "source",
                endpointContractVersion: "1.0.0",
                source: {
                    id: "commerce",
                    meta: { name: "Commerce" },
                    endpoints: [
                        {
                            endpointId: "listOffers",
                            method: "GET",
                            targetUrl: "https://example.com/offers",
                            params: [],
                            output: [{ status: "200", body: { type: "array", items: { type: "object" } } }],
                        },
                    ],
                },
            },
        ],
    });
}

function collectionDefinition(version = "1.0.0"): IntegrationDefinition {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "collection",
        kind: "ulvia",
        label: "Ulvia",
        version,
        inputs: [],
        theme: {
            categories: [
                {
                    id: "appearance",
                    label: "Appearance",
                    tokens: [{ id: "accent", label: "Accent", type: "color", defaults: { light: "blue" } }],
                },
            ],
        },
        resourceCategories: [
            { id: "content", label: "Content" },
            { id: "commerce", label: "Commerce" },
        ],
        resources: [
            {
                id: "ulvia/blocs/basic-paragraph",
                type: "bloc",
                artifact: "basic-paragraph",
                category: "content",
            },
            {
                id: "ulvia/blocs/commerce-offer-list",
                type: "bloc",
                artifact: "commerce-offer-list",
                category: "commerce",
                endpoints: [
                    {
                        source: "commerce",
                        sourceVersion: "^3.0.0",
                        endpoint: "urn:commerce:listOffers",
                        contractVersion: "^1.0.0",
                    },
                ],
            },
        ],
        artifacts: [
            {
                type: "bloc",
                bloc: { tag: "basic-paragraph", name: "Paragraph", compositionHTML: "<p>Text</p>" },
            },
            {
                type: "bloc",
                bloc: { tag: "commerce-offer-list", name: "Offers", compositionHTML: "<section>Offers</section>" },
            },
        ],
    });
}

function clientCollectionDefinition(): IntegrationDefinition {
    return parseIntegrationDefinition({
        schema: "cms.integration.definition.v2",
        type: "collection",
        kind: "client",
        label: "Client",
        version: "1.0.0",
        inputs: [],
        theme: {
            dependencies: [{ kind: "ulvia", versionRange: "^1.0.0" }],
            categories: [
                {
                    id: "appearance",
                    label: "Appearance",
                    tokens: [
                        {
                            id: "accent",
                            label: "Accent",
                            type: "color",
                            defaults: { light: "var(--ulvia-accent)" },
                        },
                    ],
                },
            ],
        },
        resourceCategories: [{ id: "content", label: "Content" }],
        resources: [
            {
                id: "client/blocs/feature",
                type: "bloc",
                artifact: "client-feature",
                category: "content",
                requires: {
                    collections: [
                        {
                            kind: "ulvia",
                            versionRange: "^1.0.0",
                            resources: ["ulvia/blocs/basic-paragraph"],
                        },
                    ],
                },
            },
        ],
        artifacts: [
            {
                type: "bloc",
                bloc: {
                    tag: "client-feature",
                    name: "Feature",
                    compositionHTML: "<basic-paragraph></basic-paragraph>",
                },
            },
        ],
    });
}
