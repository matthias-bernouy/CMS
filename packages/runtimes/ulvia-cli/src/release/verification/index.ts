import { INTEGRATION_MIGRATION_PHASES, type IntegrationMigrationPhase } from "@bernouy/cms-integrations";
import type { LocalReleaseVerificationInput, LocalReleaseVerifier } from "../types";
import { runAuthorTests } from "../author-tests";
import { runReleaseScenario } from "../sandbox/scenario";
import { distinctMigrationBaselines } from "./migrationStates";
import { loadUpgradeFixtureSuite, upgradeFixturesForBaseline } from "./upgradeFixtures";

export class RuntimeLocalReleaseVerifier implements LocalReleaseVerifier {
    constructor(private readonly log: (message: string) => void) {}

    async verify(input: LocalReleaseVerificationInput) {
        const packages = [input.candidate, ...input.baselines, ...input.availablePackages];
        const coordinate = `${input.candidate.package.envelope.kind}@${input.candidate.package.envelope.version}`;
        if (await runAuthorTests(input.sourceRoot)) {
            this.log(`✓ source tests passed for ${coordinate}`);
        }
        const fixtures = await loadUpgradeFixtureSuite(input.sourceRoot);
        if (fixtures) {
            this.log(`✓ loaded ${fixtures.scenarios.length} integration-owned upgrade fixture(s)`);
        }
        this.log(`… verifying fresh installation of ${coordinate}`);
        await runReleaseScenario({ target: input.candidate, packages });
        let nominalScenarioCount = 1;
        for (const baseline of input.baselines) {
            const from = baseline.package.envelope.version;
            const matching = fixtures ? upgradeFixturesForBaseline(fixtures, from) : [undefined];
            for (const fixture of matching) {
                this.log(
                    `… verifying upgrade ${from} → ${input.candidate.package.envelope.version}` +
                        (fixture ? ` with business fixture "${fixture.name}"` : ""),
                );
                await runReleaseScenario({ target: input.candidate, baseline, packages, fixture });
                nominalScenarioCount += 1;
            }
        }
        const resilienceScenarioCount = await this.verifyMigrationResilience(input, packages, fixtures);
        const scenarioCount = nominalScenarioCount + resilienceScenarioCount;
        this.log(
            `✓ runtime verification passed for ${scenarioCount} scenario(s)` +
                (resilienceScenarioCount ? `, including ${resilienceScenarioCount} crash recoveries` : ""),
        );
        return { scenarioCount, resilienceScenarioCount };
    }

    private async verifyMigrationResilience(
        input: LocalReleaseVerificationInput,
        packages: LocalReleaseVerificationInput["availablePackages"],
        fixtures: Awaited<ReturnType<typeof loadUpgradeFixtureSuite>>,
    ): Promise<number> {
        if (!input.candidate.definition.connectors?.some((connector) => connector.migration)) {
            return 0;
        }
        let count = 0;
        const baselines = distinctMigrationBaselines(input.candidate, input.baselines);
        if (baselines.length !== input.baselines.length) {
            this.log(
                `✓ resilience matrix: ${baselines.length} distinct migration state(s) ` +
                    `selected from ${input.baselines.length} historical baselines`,
            );
        }
        for (const baseline of baselines) {
            const matching = fixtures
                ? upgradeFixturesForBaseline(fixtures, baseline.package.envelope.version)
                : [undefined];
            for (const fixture of matching) {
                for (const phase of auditedMigrationPhases()) {
                    this.log(
                        `… verifying crash recovery ${baseline.package.envelope.version} → ` +
                            `${input.candidate.package.envelope.version} after ${phase}` +
                            (fixture ? ` with business fixture "${fixture.name}"` : ""),
                    );
                    await runReleaseScenario({
                        target: input.candidate,
                        baseline,
                        packages,
                        faultAfterPhase: phase,
                        fixture,
                    });
                    count += 1;
                }
            }
        }
        return count;
    }
}

function auditedMigrationPhases(): IntegrationMigrationPhase[] {
    return [...INTEGRATION_MIGRATION_PHASES];
}
