import { expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import type { ControlCms } from "../../../src/ControlCms";
import { dashboardCatalog } from "../../../src/core/admin/dashboards/catalog";

test("collection dashboards start inactive and follow collection updates without losing site activation", async () => {
    const repository = new InMemoryDashboardRepository();
    let siteId = "site-a";
    const release = {
        publisherId: "ulvia.examples",
        locale: "en",
        translations: {
            en: {
                "collection.name": "Test",
                "dashboard.starter.name": "Starter",
                "nav.overview": "Overview",
                "view.overview.name": "Overview",
            },
            fr: {
                "collection.name": "Test FR",
                "dashboard.starter.name": "Démarrage",
                "nav.overview": "Vue d’ensemble",
                "view.overview.name": "Vue d’ensemble",
            },
        },
        name: "collection.name",
        blocs: [],
        views: [
            {
                id: "overview",
                name: "view.overview.name",
                icon: "star",
                uses: [],
                requires: [],
                html: "<section>Overview</section>",
            },
        ],
        dashboards: [
            {
                id: "starter",
                name: "dashboard.starter.name",
                icon: "database",
                navigation: [{ id: "overview", label: "nav.overview", use: "overview" }],
            },
        ],
    };
    const cms = {
        dashboards: repository,
        config: {
            collections: {
                get siteId() {
                    return siteId;
                },
                store: {
                    snapshot: async () => ({ collections: [{ collectionId: "test", release }] }),
                },
            },
        },
    } as unknown as ControlCms;
    const [initial] = await dashboardCatalog(cms);
    expect(initial).toMatchObject({ icon: "database", enabled: false, revision: 0, origin: { collectionId: "test" } });
    expect(initial?.navigation?.[0]?.icon).toBe("star");
    const [french] = await dashboardCatalog(cms, "fr-FR");
    expect(french).toMatchObject({ name: "Démarrage", collectionName: "Test FR" });
    expect(french?.navigation[0]?.label).toBe("Vue d’ensemble");
    await repository.create({ ...initial!, enabled: true, revision: 1 });
    release.translations.en["dashboard.starter.name"] = "Updated starter";
    release.translations.en["nav.overview"] = "Updated overview";
    const [updated] = await dashboardCatalog(cms);
    expect(updated).toMatchObject({ enabled: true, revision: 1, name: "Updated starter" });
    expect(updated?.navigation?.[0]?.label).toBe("Updated overview");
    siteId = "site-b";
    const [otherSite] = await dashboardCatalog(cms);
    expect(otherSite).toMatchObject({ enabled: false, revision: 0 });
    expect(otherSite?.id).not.toBe(initial?.id);
});
