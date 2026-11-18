import { expect, test } from "bun:test";
import { officialCapabilityInventory } from "../../capabilities/inventory";
import { assessmentScenarios } from "../../scenarios/plan";
import { controlledPrograms } from "./controlled";
import { environmentProfile } from "../measurements/provenance";

test("controlled service preparation follows the selected real workflows and fingerprints every service", async () => {
    const inventory = await officialCapabilityInventory();
    const scenarios = assessmentScenarios(inventory, "selection-test").map((row) => row.definition);
    const selected = (prefix: string) =>
        scenarios.filter(
            (row) => row.id.startsWith(prefix) && row.obligations.every((entry) => entry.variant === "nominal"),
        );
    const configuration = selected("email-configuration.");
    expect(configuration.length).toBeGreaterThan(0);
    expect((await controlledPrograms(inventory, configuration)).profiles).toBeUndefined();
    const both = await controlledPrograms(inventory, [...selected("hosting."), ...selected("email-delivery.")]);
    expect(Object.keys(both.profiles!).sort()).toEqual(["dns", "smtp"]);
    expect(both.profiles?.smtp?.programDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(both.profiles?.smtp?.memoryBytes).toBe(256 * 1024 ** 2);
    const recovery = selected("access-recovery.lifecycle.confirm-email-verification.");
    expect(recovery.length).toBeGreaterThan(0);
    expect((await controlledPrograms(inventory, recovery)).smtp).toBeDefined();
    const tls = await controlledPrograms(inventory, selected("hosting-tls."));
    expect(Object.keys(tls.profiles!).sort()).toEqual(["dns", "tls"]);
    expect(tls.tls?.profile.programDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(tls.tls?.program).toContain('"issuer');
    const collectionRecovery = await controlledPrograms(
        inventory,
        selected("installation-collection-upgrades.lifecycle.resume-collection-upgrade."),
    );
    expect(Object.keys(collectionRecovery.profiles!)).toEqual(["collection-recovery-worker"]);
    expect(collectionRecovery.profiles?.["collection-recovery-worker"]?.memoryBytes).toBe(1024 ** 3);
    expect(environmentProfile("probe", both.profiles).fingerprint).not.toBe(
        environmentProfile("probe", { dns: both.profiles!.dns! }).fingerprint,
    );
});
