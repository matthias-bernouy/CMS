import { expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import type { ControlCms } from "../../../src/ControlCms";
import { dashboardCatalog } from "../../../src/core/admin/dashboards/catalog";

test("collection dashboards start inactive and follow collection updates without losing site activation", async () => {
    const repository = new InMemoryDashboardRepository();
    let siteId = "site-a";
    const release = {
        publisherId: "ulvia.examples",
        name: "Test",
        views: [{ id: "overview", name: "Overview", icon: "star", html: "<section>Overview</section>" }],
        dashboards: [
            {
                id: "starter",
                name: "Starter",
                icon: "database",
                navigation: [{ id: "overview", label: "Overview", use: "overview" }],
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
    await repository.create({ ...initial!, enabled: true, revision: 1 });
    release.dashboards[0]!.name = "Updated starter";
    release.dashboards[0]!.navigation[0]!.label = "Updated overview";
    const [updated] = await dashboardCatalog(cms);
    expect(updated).toMatchObject({ enabled: true, revision: 1, name: "Updated starter" });
    expect(updated?.navigation?.[0]?.label).toBe("Updated overview");
    siteId = "site-b";
    const [otherSite] = await dashboardCatalog(cms);
    expect(otherSite).toMatchObject({ enabled: false, revision: 0 });
    expect(otherSite?.id).not.toBe(initial?.id);
});
