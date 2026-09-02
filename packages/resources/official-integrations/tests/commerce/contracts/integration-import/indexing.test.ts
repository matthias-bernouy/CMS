import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { importIntegration, type IntegrationBlocArtifact } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, validateSource } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { blocImporter, connectorDeployer, installedBasicBlocs } from "./setup";

describe("commerce 1.1.0 indexing contract", () => {
    test("keeps the additive release unverified until publication", async () => {
        const index = await repository().getIndex("commerce");

        expect(index).toMatchObject({ stable: "1.0.0", latest: "1.0.0" });
        expect(index?.versions.find(({ version }) => version === "1.1.0")?.status).toBe("unverified");
    });

    test("imports product and offer strategies for id and slug identities", async () => {
        const definition = await repository().get("commerce", "1.1.0");
        if (!definition) {
            throw new Error("commerce 1.1.0 definition not found");
        }
        const sources = new InMemorySourceRepository();
        const importedBlocs: IntegrationBlocArtifact[] = [];

        await importIntegration(
            {
                sources,
                sourceOverlays: new InMemorySourceOverlayRepository(),
                dashboards: new InMemoryDashboardRepository(),
                dashboardViews: new InMemoryDashboardViewRepository(),
                secrets: new InMemorySecretStore(),
                roles: new InMemoryRolesRepository(),
                installations: await installedBasicBlocs(),
                triggers: new InMemoryTriggerRepository(),
                connectorDeployers: [connectorDeployer(() => {})],
                blocs: blocImporter(importedBlocs),
            },
            { kind: "commerce", version: "1.1.0", answers: { id: "commerce" }, options: {} },
            [definition],
        );

        const source = await sources.getSource("urn:commerce");
        expect(source).toBeDefined();
        expect(validateSource(source!)).toEqual([]);
        expect(source?.indexing?.entities.map(({ id }) => id)).toEqual([
            "product-by-id",
            "product-by-slug",
            "offer-by-id",
            "offer-by-slug",
        ]);
        expect(source?.indexing?.entities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "product-by-id",
                    label: "Product",
                    resolve: {
                        endpointUrn: "urn:commerce:product",
                        identity: { key: "id", inputParam: "id", outputPath: "id" },
                    },
                    discover: expect.objectContaining({
                        endpointUrn: "urn:commerce:products",
                        identityPath: "id",
                    }),
                }),
                expect.objectContaining({
                    id: "offer-by-slug",
                    label: "Offer",
                    resolve: {
                        endpointUrn: "urn:commerce:offer",
                        identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                    },
                    discover: expect.objectContaining({
                        endpointUrn: "urn:commerce:offers",
                        identityPath: "slug",
                    }),
                    variables: expect.objectContaining({
                        price: { path: "acceptedPriceAmount", type: "number" },
                        productTitle: { path: "product.title", type: "text" },
                    }),
                    defaults: {
                        titleTemplate: "${content.title}",
                        descriptionTemplate: "${content.description}",
                    },
                }),
            ]),
        );
    });
});

function repository(): FsIntegrationDefinitionRepository {
    return new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
}
