import { expect, test } from "bun:test";
import { healthReport } from "cms-control/components/admin/Resources/Health/model";

test("health report flags stale provider observations", () => {
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
    const report = healthReport("/cms", providers, { available: [] }, { installed: [], releases: [] }, now);

    expect(report.providers[0]).toMatchObject({ state: "Check overdue", tone: "warning" });
    expect(report.sources[0]).toMatchObject({ state: "Check overdue", tone: "warning" });
    expect(report.issues).toBe(2);
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
        now,
    );

    expect(report.providers[0]!.state).toBe("Healthy");
    expect(report.collections[0]!.state).toBe("Up to date");
    expect(report.issues).toBe(0);
});
