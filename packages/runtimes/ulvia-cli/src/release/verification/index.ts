import { identifyReleaseMigrationStateKey, planReleaseVerification } from "@bernouy/cms-integration-verification";
import { loadUpgradeFixtureSuiteFromVerification } from "@bernouy/cms-integration-verification/bun";
import type { LocalReleaseVerificationInput, LocalReleaseVerifier } from "../types";
import { runAuthorTests } from "../author-tests";
import { runReleaseScenario } from "../sandbox/scenario";

export class RuntimeLocalReleaseVerifier implements LocalReleaseVerifier {
    constructor(private readonly log: (message: string) => void) {}

    async verify(input: LocalReleaseVerificationInput) {
        const packages = [input.candidate, ...input.baselines, ...input.availablePackages];
        const coordinate = `${input.candidate.package.envelope.kind}@${input.candidate.package.envelope.version}`;
        if (await runAuthorTests(input.sourceRoot)) {
            this.log(`✓ source tests passed for ${coordinate}`);
        }
        const fixtures = input.candidate.verification
            ? await loadUpgradeFixtureSuiteFromVerification(input.candidate.verification.envelope)
            : null;
        if (fixtures) {
            this.log(`✓ loaded ${fixtures.scenarios.length} integration-owned upgrade fixture(s)`);
        }
        const baselines = await Promise.all(
            input.baselines.map(async (baseline) => ({
                version: baseline.package.envelope.version,
                packageDigest: baseline.package.digest,
                resilienceKey: await identifyReleaseMigrationStateKey({
                    candidate: input.candidate.definition,
                    baseline: baseline.definition,
                }),
            })),
        );
        const plan = planReleaseVerification({
            baselines,
            ...(fixtures ? { fixtures: fixtures.scenarios.map(({ name, from }) => ({ name, from })) } : {}),
            hasMigrations: Boolean(input.candidate.definition.connectors?.some((connector) => connector.migration)),
        });
        if (plan.distinctMigrationStateCount !== input.baselines.length) {
            this.log(
                `✓ resilience matrix: ${plan.distinctMigrationStateCount} distinct migration state(s) ` +
                    `selected from ${input.baselines.length} historical baselines`,
            );
        }
        for (const scenario of plan.scenarios) {
            const baseline =
                scenario.type === "fresh-install"
                    ? undefined
                    : input.baselines.find(
                          (entry) =>
                              entry.package.envelope.version === scenario.baseline.version &&
                              entry.package.digest === scenario.baseline.packageDigest,
                      );
            const fixture =
                scenario.type === "fresh-install" || !scenario.fixtureName
                    ? undefined
                    : fixtures?.scenarios.find(({ name }) => name === scenario.fixtureName);
            this.log(description(coordinate, input.candidate.package.envelope.version, scenario));
            await runReleaseScenario({
                target: input.candidate,
                packages,
                ...(baseline ? { baseline } : {}),
                ...(fixture ? { fixture } : {}),
                ...(scenario.type === "crash-recovery" ? { faultAfterPhase: scenario.phase } : {}),
            });
        }
        const scenarioCount = plan.scenarios.length;
        this.log(
            `✓ runtime verification passed for ${scenarioCount} scenario(s)` +
                (plan.resilienceScenarioCount ? `, including ${plan.resilienceScenarioCount} crash recoveries` : ""),
        );
        return { scenarioCount, resilienceScenarioCount: plan.resilienceScenarioCount };
    }
}

function description(
    coordinate: string,
    targetVersion: string,
    scenario: ReturnType<typeof planReleaseVerification>["scenarios"][number],
): string {
    if (scenario.type === "fresh-install") {
        return `… verifying fresh installation of ${coordinate}`;
    }
    const fixture = scenario.fixtureName ? ` with business fixture "${scenario.fixtureName}"` : "";
    if (scenario.type === "upgrade") {
        return `… verifying upgrade ${scenario.baseline.version} → ${targetVersion}${fixture}`;
    }
    return `… verifying crash recovery ${scenario.baseline.version} → ${targetVersion} after ${scenario.phase}${fixture}`;
}
