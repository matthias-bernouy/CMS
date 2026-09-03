import type {
    UpgradeFixtureContextV1,
    UpgradeFixtureScenarioV1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import type { VerificationValue } from "@bernouy/cms-integration-verification/sdk/v1";
import type { LocalSupabaseEnvironment } from "../../../../runtime/supabase";
import { adoptRequiredLegacyBaselines } from "../../adoption";
import { sandboxAnswers } from "../../answers";
import { ReleaseSandboxClient } from "../../client";
import { installRequiredDependencies } from "../../dependencies";
import type { ReleaseScenario } from "..";
import { verifyMigrationCrashRecovery } from "../resilience";
import { installFixtureDependencies } from "./dependencies";
import { createUpgradeFixtureHarness, type UpgradeFixtureHarness } from ".";
import { snapshotFixtureState } from "./state";

export async function executeInstalledReleaseScenario(
    input: Readonly<{
        scenario: ReleaseScenario;
        supabase: LocalSupabaseEnvironment;
        client: ReleaseSandboxClient;
        restart: () => Promise<ReleaseSandboxClient>;
    }>,
): Promise<void> {
    const { scenario } = input;
    let client = input.client;
    let harness: UpgradeFixtureHarness | undefined;
    try {
        const installed = new Map<string, string>();
        const initial = scenario.baseline ?? scenario.target;
        if (scenario.fixture?.dependencies?.some((dependency) => dependency.kind === initial.package.envelope.kind)) {
            throw new Error("Upgrade fixture cannot declare its own integration as a dependency");
        }
        await installFixtureDependencies(scenario.fixture?.dependencies ?? [], scenario.packages, installed, client);
        await installRequiredDependencies(initial, scenario.packages, installed, client);
        await client.install(
            initial.package.envelope.kind,
            initial.package.envelope.version,
            sandboxAnswers(initial.definition),
        );
        installed.set(initial.package.envelope.kind, initial.package.envelope.version);
        if (!scenario.baseline) {
            return;
        }
        let fixtureState: VerificationValue = null;
        if (scenario.fixture) {
            harness = createUpgradeFixtureHarness({
                kind: scenario.target.package.envelope.kind,
                baselineVersion: scenario.baseline.package.envelope.version,
                targetVersion: scenario.target.package.envelope.version,
                client: () => client,
                supabase: input.supabase,
            });
            fixtureState = await runSeed(scenario.fixture, harness.context("before-upgrade"));
        }
        await installRequiredDependencies(scenario.target, scenario.packages, installed, client);
        await adoptRequiredLegacyBaselines(scenario.baseline, scenario.target, client);
        if (scenario.faultAfterPhase) {
            await verifyMigrationCrashRecovery({
                client,
                kind: scenario.target.package.envelope.kind,
                sourceVersion: scenario.baseline.package.envelope.version,
                targetVersion: scenario.target.package.envelope.version,
                phase: scenario.faultAfterPhase,
                restart: async () => {
                    client = await input.restart();
                    return client;
                },
            });
        } else {
            await client.upgrade(scenario.target.package.envelope.kind, scenario.target.package.envelope.version);
        }
        if (scenario.fixture && harness) {
            await runAssertion(scenario.fixture, harness.context("after-upgrade"), fixtureState);
        }
    } finally {
        await harness?.close();
    }
}

async function runSeed(
    fixture: UpgradeFixtureScenarioV1,
    context: UpgradeFixtureContextV1,
): Promise<VerificationValue> {
    try {
        const state = await fixture.seedBeforeUpgrade(context);
        return snapshotFixtureState(state);
    } catch (error) {
        throw fixtureFailure(fixture, "while seeding the baseline", error);
    }
}

async function runAssertion(
    fixture: UpgradeFixtureScenarioV1,
    context: UpgradeFixtureContextV1,
    state: VerificationValue,
): Promise<void> {
    try {
        await fixture.assertAfterUpgrade(context, state);
    } catch (error) {
        throw fixtureFailure(fixture, "after the upgrade", error);
    }
}

function fixtureFailure(fixture: UpgradeFixtureScenarioV1, stage: string, cause: unknown): Error {
    const detail = cause instanceof Error ? cause.message.trim().slice(0, 500) : String(cause).slice(0, 500);
    return new Error(`Upgrade fixture "${fixture.name}" failed ${stage}${detail ? `: ${detail}` : ""}`, { cause });
}
