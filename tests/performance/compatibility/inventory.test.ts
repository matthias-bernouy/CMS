import { expect, test } from "bun:test";
import { compileOfficialFeatures, compileRetainedFeatures } from "@bernouy/ulvia-provider/build";
import { inventoryFromBuilds, performanceCapabilityInventory } from "../capabilities/inventory";
import { assessmentScenarios } from "../scenarios/plan";
import { auditPlan } from "../capabilities/coverage";
import { compatibilityCatalogue } from "./inventory";

test("every retained exact capability is admitted against its shared executor without duplicating performance obligations", async () => {
    const current = await compileOfficialFeatures();
    const retained = await compileRetainedFeatures();
    const proof = await compatibilityCatalogue(current, retained);
    const complete = inventoryFromBuilds(current, retained);
    expect(proof.performance).toEqual(await performanceCapabilityInventory());
    expect(proof.performance.targets.every((target) => !target.retained)).toBe(true);
    expect(proof.mappings).toHaveLength(complete.targets.filter((target) => target.retained).length);
    for (const mapping of proof.mappings) {
        const original = complete.targets.find((target) => target.key === mapping.target)!;
        const executor = proof.performance.targets.find((target) => target.key === mapping.sharedExecutor)!;
        expect(executor.definition.id).toBe(original.definition.id);
        expect(mapping.bindings).toEqual(original.definition.bindings.map((binding) => binding.id));
        expect(executor.release.contractId).toBe(original.release.contractId);
    }
    const definitions = assessmentScenarios(proof.performance, "executor-scope-test").map((row) => row.definition);
    expect(definitions.some((definition) => definition.id.startsWith("retained."))).toBe(false);
    expect(
        auditPlan(proof.performance, definitions).every(
            (finding) =>
                !finding.obligation ||
                proof.performance.targets.some((target) => target.key === finding.obligation!.target),
        ),
    ).toBe(true);
});

test("unsupported, duplicated and corrupt compatibility claims fail rather than being silently excluded", async () => {
    const current = await compileOfficialFeatures();
    const retained = await compileRetainedFeatures();
    const first = retained[0]!;
    await expect(compatibilityCatalogue(current, [first, first])).rejects.toThrow("Duplicate");
    await expect(
        compatibilityCatalogue(current, [
            { ...first, implementations: [{ ...first.implementations[0]!, contractId: "unknown/executor" }] },
        ]),
    ).rejects.toThrow("no captured executor");
    const corrupt = {
        ...first,
        contracts: first.contracts.map((entry) =>
            entry.digest === first.implementations[0]!.digest ? { ...entry, canonicalJson: "{}" } : entry,
        ),
    };
    await expect(compatibilityCatalogue(current, [corrupt])).rejects.toThrow();
});
