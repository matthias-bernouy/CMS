import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { importIntegration, InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, validateSource } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { connectorDeployer } from "./setup";

describe("commerce 3.1.0 indexing contract", () => {
    test("publishes the current source as the sole authored release", async () => {
        const index = await repository().getIndex("commerce");

        expect(index).toMatchObject({ stable: "3.1.0", latest: "3.1.0", type: "source" });
        expect(index?.versions).toEqual([{ version: "3.1.0", path: ".", definition: "definition.json" }]);
    });

    test("imports product and offer strategies for id and slug identities", async () => {
        const definition = await repository().get("commerce", "3.1.0");
        if (!definition) {
            throw new Error("commerce 3.1.0 definition not found");
        }
        const sources = new InMemorySourceRepository();

        await importIntegration(
            {
                sources,
                sourceOverlays: new InMemorySourceOverlayRepository(),
                dashboards: new InMemoryDashboardRepository(),
                dashboardViews: new InMemoryDashboardViewRepository(),
                secrets: new InMemorySecretStore(),
                roles: new InMemoryRolesRepository(),
                installations: new InMemoryIntegrationInstallationRepository(),
                triggers: new InMemoryTriggerRepository(),
                connectorDeployers: [connectorDeployer(() => {})],
            },
            { kind: "commerce", version: "3.1.0", answers: { id: "commerce" }, options: {} },
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
