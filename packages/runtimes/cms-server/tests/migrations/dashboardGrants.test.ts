import { expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import type { CollectionViewExecutionActivation } from "@bernouy/cms-gateway/execution";
import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import { createDashboardMigrationParticipant } from "../../src/runtime/stores/dashboardMigrationParticipant";

test("prepares exact target grants for enabled site and collection dashboards", async () => {
    const dashboards = new InMemoryDashboardRepository();
    await dashboards.create({
        id: "site-dashboard",
        siteId: "site",
        name: "Site dashboard",
        enabled: true,
        revision: 1,
        navigation: [{ id: "overview", label: "Overview", use: "atlas:overview" }],
    });
    await dashboards.create({
        id: "collection-dashboard",
        siteId: "site",
        name: "Collection dashboard",
        enabled: true,
        revision: 1,
        navigation: [],
        origin: {
            kind: "collection",
            publisherId: "atlas.official",
            collectionId: "atlas",
            dashboardId: "operations",
        },
    });
    const activations: CollectionViewExecutionActivation[] = [];
    const participant = createDashboardMigrationParticipant(dashboards, {
        async activate(input) {
            activations.push(input);
            return {} as never;
        },
        async authorize() {
            return {} as never;
        },
    });

    await participant.prepareTarget?.({ siteId: "site", collections: targetCollections() });

    expect(activations).toHaveLength(2);
    expect(activations.map(({ consumer }) => consumer.viewId).sort()).toEqual(["details", "overview"]);
    expect(activations[0]?.consumer).toMatchObject({
        collectionId: "atlas",
        collectionVersion: "2.0.0",
        collectionDigest: `sha256:${"a".repeat(64)}`,
        viewGeneration: 2,
    });
    expect(activations.flatMap(({ requirements }) => requirements)).toContainEqual({
        contractId: "catalog",
        capabilityId: "item.list",
        versionRange: "^1.0.0",
    });
});

test("blocks a capability-bearing target when execution planning is unavailable", async () => {
    const dashboards = new InMemoryDashboardRepository();
    await dashboards.create({
        id: "site-dashboard",
        siteId: "site",
        name: "Site dashboard",
        enabled: true,
        revision: 1,
        navigation: [{ id: "overview", label: "Overview", use: "atlas:overview" }],
    });
    const participant = createDashboardMigrationParticipant(dashboards);

    await expect(participant.prepareTarget?.({ siteId: "site", collections: targetCollections() })).rejects.toThrow(
        "Execution planning is unavailable",
    );
});

function targetCollections(): InstalledCollection[] {
    return [
        {
            collectionId: "atlas",
            digest: `sha256:${"a".repeat(64)}`,
            configuration: {},
            textOverrides: {},
            release: {
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                collectionId: "atlas",
                publisherId: "atlas.official",
                version: "2.0.0",
                dataGeneration: 1,
                migrations: [],
                name: "collection.name",
                locale: "en",
                translations: { en: { "collection.name": "Atlas", "dashboard.name": "Operations" } },
                assets: [],
                blocs: [
                    {
                        kind: "component",
                        id: "atlas-table",
                        label: "collection.name",
                        shadowdom: "<slot></slot>",
                        slots: {},
                        uses: [],
                        requires: [{ contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0" }],
                    },
                ],
                views: [
                    {
                        id: "overview",
                        generation: 2,
                        name: "collection.name",
                        uses: ["atlas-table"],
                        requires: [],
                        html: "<atlas-table></atlas-table>",
                    },
                    {
                        id: "details",
                        generation: 2,
                        name: "collection.name",
                        uses: [],
                        requires: [{ contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0" }],
                        html: "<p>Details</p>",
                    },
                ],
                dashboards: [
                    {
                        id: "operations",
                        name: "dashboard.name",
                        navigation: [{ id: "details", label: "collection.name", use: "details" }],
                    },
                ],
            },
        },
    ];
}
