import { expect, test } from "bun:test";
import { healthReport } from "cms-control/components/admin/Resources/Health/model";

test("health report flags stale provider observations and dashboards without members", () => {
    const now = Date.parse("2026-10-01T15:00:00.000Z");
    const providers = {
        installations: [
            {
                id: "provider-1",
                providerId: "ulvia.official",
                accountId: "main",
                status: "enabled",
                observedAt: "2026-10-01T14:50:00.000Z",
                contracts: [
                    {
                        contractId: "catalog.items",
                        version: "1.0.0",
                        digest: "sha256:one",
                        status: "ready",
                    },
                ],
            },
        ],
        selected: [
            {
                installationId: "provider-1",
                contractId: "catalog.items",
                version: "1.0.0",
                digest: "sha256:one",
            },
        ],
    };
    const report = healthReport(
        "/cms",
        providers,
        { available: [] },
        { installed: [], releases: [] },
        { dashboards: [{ id: "dashboard-1", name: "Sales", enabled: true, members: [] }] },
        now,
    );

    expect(report.providers[0]).toMatchObject({ state: "Check overdue", tone: "warning" });
    expect(report.sources[0]).toMatchObject({ state: "Check overdue", tone: "warning" });
    expect(report.dashboards[0]).toMatchObject({ state: "No members", tone: "warning" });
    expect(report.issues).toBe(3);
});

test("health report marks fresh ready resources as healthy", () => {
    const now = Date.parse("2026-10-01T15:00:00.000Z");
    const report = healthReport(
        "/cms",
        {
            installations: [
                {
                    id: "provider-1",
                    providerId: "ulvia.official",
                    accountId: "main",
                    status: "enabled",
                    observedAt: "2026-10-01T14:59:30.000Z",
                    contracts: [],
                },
            ],
            selected: [],
        },
        { available: [] },
        { installed: [{ collectionId: "test", version: "1.0.0" }], releases: [] },
        { dashboards: [{ id: "dashboard-1", name: "Sales", enabled: true, members: ["member"] }] },
        now,
    );

    expect(report.providers[0]!.state).toBe("Healthy");
    expect(report.collections[0]!.state).toBe("Up to date");
    expect(report.dashboards[0]!.state).toBe("Active");
    expect(report.issues).toBe(0);
});

test("health report links an active dashboard to its missing source", () => {
    const report = healthReport(
        "/cms",
        { installations: [], selected: [] },
        { available: [] },
        { installed: [], releases: [] },
        {
            dashboards: [
                {
                    id: "catalog",
                    name: "Catalog workspace",
                    enabled: true,
                    members: ["member"],
                    sourceContracts: ["catalog.items"],
                },
            ],
        },
    );

    expect(report.dashboards[0]).toMatchObject({
        state: "Source missing",
        tone: "danger",
        detail: "Connect catalog.items in Sources",
    });
    expect(report.issues).toBe(1);
});
