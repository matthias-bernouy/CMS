import { expect, test } from "bun:test";
import { officialCapabilityInventory } from "../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../capabilities/coverage";
import { hostingScenarios } from "./hosting/plan";
import { readerScenarios } from "./readers/plan";
import { gatewayScenarios } from "./gateway/plan";
import { assertGatewayScope } from "./gateway/context";
import { hostingTechnicalScenarios } from "./hosting/technical/plan";
import { collectionUpgradeScenarios } from "./installations/collection-upgrades/plan";
import { settingsTenants } from "./content/settings/tenant";
import { secretScenarios } from "./secrets/plan";
import { emailScenarios } from "./email/plan";
import { accessScenarios } from "./access/plan";

const inventory = await officialCapabilityInventory();

test("access read plans include real volume, history and authority invalidation without treating preparation as coverage", () => {
    const ids = ["get-user", "list-users", "list-personal-access-tokens", "resolve-actor", "inspect-actor"];
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter(
            (row) => !row.retained && row.release.contractId === "ulvia/cms.access" && ids.includes(row.definition.id),
        ),
        templates: [],
    };
    const definitions = [
        ...accessScenarios(inventory, "access-plan").map((row) => row.definition),
        ...gatewayScenarios(inventory, "access-plan").map((row) => row.definition),
    ].filter((row) => row.obligations.every((entry) => scoped.targets.some((target) => target.key === entry.target)));
    // Query baseline readers also participate in the full plan; this focused check verifies the newly added variants.
    const additions = definitions.filter((row) =>
        row.obligations.every((entry) => ["large", "history", "invalidation"].includes(entry.variant)),
    );
    expect(additions).toHaveLength(9);
    const findings = auditPlan(scoped, definitions);
    expect(
        findings.every(
            (row) =>
                row.code === "missing-scenario" &&
                ["nominal", "cold", "warm", "concurrent"].includes(row.obligation!.variant),
        ),
    ).toBe(true);
    expect(coverageMatrix(scoped, definitions, []).every((row) => row.status !== "covered")).toBe(true);
});

test("secret current bindings have all mandatory volume, history and invalidation cases while SMTP adds only its missing read variant", () => {
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter((row) => !row.retained && row.release.contractId === "ulvia/cms.secrets"),
        templates: [],
    };
    const definitions = secretScenarios(inventory, "planning-test").map((row) => row.definition);
    expect(auditPlan(scoped, definitions)).toEqual([]);
    expect(definitions.filter((row) => row.id.startsWith("secrets-read."))).toHaveLength(7);
    expect(coverageMatrix(scoped, definitions, []).every((row) => row.status === "unattempted")).toBe(true);
    const smtp = emailScenarios(inventory, "planning-test", settingsTenants(inventory)).filter((row) =>
        row.definition.id.startsWith("email-configuration-read."),
    );
    expect(smtp).toHaveLength(1);
    expect(smtp[0]!.definition.obligations[0]!.variant).toBe("invalidation");
});

test("collection recovery defines both exact bindings and every baseline variant without credit for its interrupted preparation", () => {
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter((row) => !row.retained && row.definition.id === "resume-collection-upgrade"),
        templates: [],
    };
    const scenarios = collectionUpgradeScenarios(inventory, "planning-test", settingsTenants(inventory))
        .map((row) => row.definition)
        .filter((row) =>
            row.obligations.every((entry) => scoped.targets.some((target) => target.key === entry.target)),
        );
    expect(scoped.targets).toHaveLength(1);
    expect(scenarios).toHaveLength(8);
    expect(auditPlan(scoped, scenarios)).toEqual([]);
    expect(coverageMatrix(scoped, scenarios, []).every((row) => row.status === "unattempted")).toBe(true);
});

test("technical domain routing covers every mandatory exact variant without treating a plan as measured coverage", () => {
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter(
            (row) => !row.retained && row.release.contractId === "ulvia/provider.routing",
        ),
        templates: [],
    };
    const scenarios = hostingTechnicalScenarios(inventory, "planning-test")
        .map((row) => row.definition)
        .filter((row) =>
            row.obligations.every((entry) => scoped.targets.some((target) => target.key === entry.target)),
        );
    expect(scenarios).toHaveLength(5);
    expect(auditPlan(scoped, scenarios)).toEqual([]);
    expect(coverageMatrix(scoped, scenarios, []).every((row) => row.status === "unattempted")).toBe(true);
    expect(auditPlan(scoped, scenarios.slice(1)).some((row) => row.code === "missing-scenario")).toBe(true);
});

test("TLS permission defines all exact native variants without crediting its real certificate preparation", () => {
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter((row) => !row.retained && row.release.contractId === "ulvia/provider.tls"),
        templates: [],
    };
    const scenarios = hostingTechnicalScenarios(inventory, "planning-test")
        .map((row) => row.definition)
        .filter((row) => row.id.startsWith("hosting-tls."));
    expect(scoped.targets).toHaveLength(1);
    expect(scenarios).toHaveLength(5);
    expect(auditPlan(scoped, scenarios)).toEqual([]);
    expect(coverageMatrix(scoped, scenarios, []).every((row) => row.status === "unattempted")).toBe(true);
});

test("Hosting defines every current exact binding and mandatory variant without claiming unexecuted coverage", () => {
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter((row) => !row.retained && row.release.contractId === "ulvia/cms.hosting"),
        templates: [],
    };
    expect(scoped.targets.length).toBeGreaterThan(0);
    const scenarios = hostingScenarios(inventory, "planning-test").map((row) => row.definition);
    expect(auditPlan(scoped, scenarios)).toEqual([]);
    expect(coverageMatrix(scoped, scenarios, []).every((row) => row.status === "unattempted")).toBe(true);
    const missing = auditPlan(scoped, scenarios.slice(1));
    expect(missing.some((row) => row.code === "missing-scenario")).toBe(true);
});

test("Gateway scope oracles distinguish logical site identity from physical instance identity", () => {
    const route = {
        selection: { siteId: "default", installationId: "installed" },
        installation: {
            installation: { siteId: "default", id: "installed" },
            observation: { report: { instanceId: "instance-a" } },
        },
    };
    expect(() => assertGatewayScope(route, "instance-a")).not.toThrow();
    expect(() => assertGatewayScope(route, "instance-b")).toThrow();
    expect(() =>
        assertGatewayScope({ ...route, selection: { ...route.selection, siteId: "instance-a" } }, "instance-a"),
    ).toThrow();
    expect(() =>
        assertGatewayScope({ ...route, selection: { ...route.selection, installationId: "another" } }, "instance-a"),
    ).toThrow();
});

test("reader and machine baseline plans preserve missing advanced variants as blocking findings", () => {
    const scenarios = [
        ...readerScenarios(inventory, "planning-test"),
        ...gatewayScenarios(inventory, "planning-test"),
    ].map((row) => row.definition);
    const keys = new Set(scenarios.flatMap((row) => row.obligations.map((obligation) => obligation.target)));
    const scoped = { ...inventory, targets: inventory.targets.filter((row) => keys.has(row.key)), templates: [] };
    const findings = auditPlan(scoped, scenarios);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((row) => row.code === "missing-scenario")).toBe(true);
    expect(findings.every((row) => ["large", "history", "invalidation"].includes(row.obligation!.variant))).toBe(true);
    expect(coverageMatrix(scoped, scenarios, []).some((row) => row.status === "covered")).toBe(false);
    expect(
        scenarios.flatMap((row) => row.obligations).every((row) => row.binding === "http" || row.binding === "mcp"),
    ).toBe(true);
});
