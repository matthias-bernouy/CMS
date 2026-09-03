import { describe, expect, test } from "bun:test";
import { INTEGRATION_MIGRATION_PHASES } from "@bernouy/cms-integrations";
import {
    identifyReleaseMigrationStateKey,
    identifyReleaseVerificationPlan,
    planReleaseVerification,
    validateReleaseVerificationPlan,
} from "../../../../src/exports/index";

const digest = (value: string) => value.repeat(64);

describe("shared release verification plan", () => {
    test("plans every upgrade while deduplicating equivalent crash-recovery states", () => {
        const plan = planReleaseVerification({
            baselines: [
                { version: "1.0.0", packageDigest: digest("a"), resilienceKey: digest("1") },
                { version: "1.1.0", packageDigest: digest("b"), resilienceKey: digest("1") },
                { version: "2.0.0", packageDigest: digest("c"), resilienceKey: digest("2") },
            ],
            fixtures: [
                { name: "legacy state", from: ">=1.0.0 <2.0.0" },
                { name: "current state", from: "^2.0.0" },
            ],
            hasMigrations: true,
        });

        expect(plan.nominalScenarioCount).toBe(4);
        expect(plan.distinctMigrationStateCount).toBe(2);
        expect(plan.resilienceScenarioCount).toBe(2 * INTEGRATION_MIGRATION_PHASES.length);
        expect(plan.scenarios.filter(({ type }) => type === "upgrade")).toHaveLength(3);
        expect(plan.scenarios.filter(({ type }) => type === "crash-recovery")[0]).toMatchObject({
            baseline: { version: "1.0.0" },
            fixtureName: "legacy state",
        });
    });

    test("plans generic upgrades without author fixtures and rejects partial fixture coverage", () => {
        const baselines = [{ version: "1.0.0", packageDigest: digest("a"), resilienceKey: digest("1") }];

        expect(planReleaseVerification({ baselines, hasMigrations: false }).scenarios).toEqual([
            { type: "fresh-install" },
            { type: "upgrade", baseline: baselines[0] },
        ]);
        expect(() =>
            planReleaseVerification({
                baselines,
                fixtures: [{ name: "new state", from: "^2.0.0" }],
                hasMigrations: false,
            }),
        ).toThrow(/do not cover immutable baseline 1\.0\.0/u);
    });

    test("identifies durable migration states independently from package-only changes", async () => {
        const candidate = definition("2.0.0", [targetConnector()]);
        const first = definition("1.1.0", [sourceConnector(1)]);
        const equivalent = definition("1.2.0", [sourceConnector(1)]);
        const changed = definition("1.3.0", [sourceConnector(2)]);

        expect(await identifyReleaseMigrationStateKey({ candidate, baseline: first })).toBe(
            await identifyReleaseMigrationStateKey({ candidate, baseline: equivalent }),
        );
        expect(await identifyReleaseMigrationStateKey({ candidate, baseline: equivalent })).not.toBe(
            await identifyReleaseMigrationStateKey({ candidate, baseline: changed }),
        );
    });

    test("rejects a plan whose derived scenario matrix was tampered with", async () => {
        const plan = planReleaseVerification({
            baselines: [{ version: "1.0.0", packageDigest: digest("a"), resilienceKey: digest("1") }],
            hasMigrations: false,
        });
        expect((await identifyReleaseVerificationPlan(plan)).digest).toHaveLength(64);
        expect(() =>
            validateReleaseVerificationPlan({
                ...plan,
                scenarios: plan.scenarios.slice(0, 1),
            }),
        ).toThrow(/not the canonical plan/u);
    });
});

function definition(version: string, connectors: unknown[]) {
    return { kind: "demo", version, name: "Demo", config: [], connectors } as never;
}

function targetConnector() {
    return {
        connectorKey: "primary",
        provider: "supabase",
        root: "connectors/supabase",
        lineageId: "demo-v1",
        migration: { supportedSources: [] },
    };
}

function sourceConnector(migrationRevision: number) {
    return {
        connectorKey: "primary",
        provider: "supabase",
        root: "connectors/supabase",
        lineageId: "demo-v1",
        migrationRevision,
        migration: {},
    };
}
