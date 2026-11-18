import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../../../capabilities/coverage";
import { settingsTenants } from "../../../content/settings/tenant";
import { installationReadScenarios } from "../plan";
import { providerReadMissingStatus } from "../oracle";

test("installation state readers declare exactly their current invalidation bindings and omissions stay blocking", async () => {
    const inventory = await performanceCapabilityInventory();
    const scenarios = installationReadScenarios(inventory, "planning", settingsTenants(inventory)).map(
        (row) => row.definition,
    );
    expect(scenarios).toHaveLength(8);
    expect(scenarios.filter((row) => row.version === 3).map((row) => row.id)).toEqual([
        "installation-read.lifecycle.get-provider-access.http.invalidation",
    ]);
    for (const id of ["get-provider-access", "get-provider-installation"]) {
        const target = inventory.targets.find(
            (row) => !row.retained && row.release.contractId === "ulvia/cms.installations" && row.definition.id === id,
        )!;
        const http = target.definition.bindings.find((row) => row.transport === "http")!;
        expect(
            http.transport === "http" &&
                Object.values(http.response.errorStatuses).includes(providerReadMissingStatus(id)),
        ).toBe(true);
    }
    const ids = new Set(scenarios.flatMap((row) => row.obligations.map((obligation) => obligation.target)));
    const selected = { ...inventory, targets: inventory.targets.filter((target) => ids.has(target.key)) };
    const missing = auditPlan(selected, scenarios).filter((finding) => finding.obligation?.variant === "invalidation");
    expect(missing).toEqual([]);
    expect(
        auditPlan(selected, scenarios.slice(1)).some(
            (finding) => finding.code === "missing-scenario" && finding.obligation?.variant === "invalidation",
        ),
    ).toBe(true);
    expect(coverageMatrix(selected, scenarios, []).every((row) => row.status !== "covered")).toBe(true);
    expect(
        scenarios.every(
            (row) => row.samples === 10 && row.obligations.every((obligation) => obligation.variant === "invalidation"),
        ),
    ).toBe(true);
});
