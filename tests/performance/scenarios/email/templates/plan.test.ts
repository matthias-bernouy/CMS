import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import { auditPlan } from "../../../capabilities/coverage";
import { requiredObligations } from "../../../capabilities/policies";
import { emailTemplateScenarios } from "./plan";

test("Templates and account associations have executable coverage for every admitted binding and required variant", async () => {
    const inventory = await performanceCapabilityInventory();
    const targets = inventory.targets.filter(
        (target) =>
            target.release.contractId === "ulvia/cms.email-templates" ||
            (target.release.contractId === "ulvia/cms.access" && target.definition.id.endsWith("email-configuration")),
    );
    const scenarios = emailTemplateScenarios(inventory, "unit").map((scenario) => scenario.definition);
    expect(targets).toHaveLength(11);
    expect(
        auditPlan({ ...inventory, targets, templates: [] }, scenarios, targets.flatMap(requiredObligations)),
    ).toEqual([]);
    expect(
        auditPlan({ ...inventory, targets, templates: [] }, scenarios.slice(1)).some(
            (finding) => finding.code === "missing-scenario",
        ),
    ).toBe(true);
});
