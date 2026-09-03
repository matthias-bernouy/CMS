import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    INTEGRATION_MIGRATION_PHASES,
    integrationVersionSatisfies,
    isExactIntegrationVersion,
    isSupportedIntegrationVersionRange,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import type {
    ReleaseVerificationPlanBaselineV1,
    ReleaseVerificationPlanFixtureV1,
    ReleaseVerificationPlanScenarioV1,
    ReleaseVerificationPlanV1,
} from "../../../interfaces/verification";
import { RELEASE_VERIFICATION_PLAN_SCHEMA } from "../../../interfaces/verification";

export function planReleaseVerification(input: {
    baselines: readonly ReleaseVerificationPlanBaselineV1[];
    fixtures?: readonly ReleaseVerificationPlanFixtureV1[];
    hasMigrations: boolean;
}): ReleaseVerificationPlanV1 {
    validateInput(input);
    const baselines = Object.freeze(
        [...input.baselines].toSorted((left, right) =>
            `${left.version}\0${left.packageDigest}`.localeCompare(`${right.version}\0${right.packageDigest}`),
        ),
    );
    const fixtures = Object.freeze(
        [...(input.fixtures ?? [])].toSorted((left, right) => left.name.localeCompare(right.name)),
    );
    const scenarios: ReleaseVerificationPlanScenarioV1[] = [{ type: "fresh-install" }];
    for (const baseline of baselines) {
        for (const fixtureName of matchingFixtureNames(fixtures.length ? fixtures : undefined, baseline.version)) {
            scenarios.push({
                type: "upgrade",
                baseline,
                ...(fixtureName ? { fixtureName } : {}),
            });
        }
    }
    const nominalScenarioCount = scenarios.length;
    const migrationBaselines = input.hasMigrations ? distinctMigrationStates(baselines) : [];
    for (const baseline of migrationBaselines) {
        for (const fixtureName of matchingFixtureNames(fixtures.length ? fixtures : undefined, baseline.version)) {
            for (const phase of INTEGRATION_MIGRATION_PHASES) {
                scenarios.push({
                    type: "crash-recovery",
                    baseline,
                    phase,
                    ...(fixtureName ? { fixtureName } : {}),
                });
            }
        }
    }
    return Object.freeze({
        schema: RELEASE_VERIFICATION_PLAN_SCHEMA,
        baselines,
        fixtures,
        hasMigrations: input.hasMigrations,
        scenarios: Object.freeze(scenarios),
        nominalScenarioCount,
        resilienceScenarioCount: scenarios.length - nominalScenarioCount,
        distinctMigrationStateCount: migrationBaselines.length,
    });
}

export async function identifyReleaseMigrationStateKey(input: {
    candidate: IntegrationDefinition;
    baseline: IntegrationDefinition;
}): Promise<string> {
    const baselineVersion = input.baseline.version;
    if (!baselineVersion || !isExactIntegrationVersion(baselineVersion)) {
        throw new TypeError("Release migration baseline must declare an exact version");
    }
    const states = (input.candidate.connectors ?? [])
        .filter((connector) => connector.migration)
        .map((target) => {
            const source = (input.baseline.connectors ?? []).find(
                (connector) =>
                    connector.connectorKey === target.connectorKey ||
                    (!connector.connectorKey &&
                        connector.provider === target.provider &&
                        (connector.root ?? ".") === (target.root ?? ".")),
            );
            const declaredSource = target.migration?.supportedSources.find((entry) =>
                integrationVersionSatisfies(baselineVersion, entry.range),
            );
            return {
                connectorKey: target.connectorKey,
                provider: target.provider,
                lineageId: source?.lineageId ?? target.lineageId,
                migrationRevision: source?.migrationRevision ?? declaredSource?.migrationRevision ?? null,
                legacyPackageDigest: source?.migration
                    ? null
                    : (declaredSource?.legacyAdoption?.packageDigest ?? `unsupported:${baselineVersion}`),
            };
        })
        .toSorted((left, right) => String(left.connectorKey).localeCompare(String(right.connectorKey)));
    return await sha256Hex(canonicalJsonBytes(states));
}

function matchingFixtureNames(
    fixtures: readonly ReleaseVerificationPlanFixtureV1[] | undefined,
    version: string,
): readonly (string | undefined)[] {
    if (!fixtures) {
        return [undefined];
    }
    const matching = fixtures.filter((fixture) => integrationVersionSatisfies(version, fixture.from));
    if (matching.length === 0) {
        throw new Error(`Upgrade fixtures do not cover immutable baseline ${version}`);
    }
    return matching.map(({ name }) => name);
}

function distinctMigrationStates(
    baselines: readonly ReleaseVerificationPlanBaselineV1[],
): readonly ReleaseVerificationPlanBaselineV1[] {
    const selected = new Map<string, ReleaseVerificationPlanBaselineV1>();
    for (const baseline of baselines) {
        if (!selected.has(baseline.resilienceKey)) {
            selected.set(baseline.resilienceKey, baseline);
        }
    }
    return [...selected.values()];
}

function validateInput(input: Parameters<typeof planReleaseVerification>[0]): void {
    const coordinates = new Set<string>();
    for (const baseline of input.baselines) {
        if (
            !isExactIntegrationVersion(baseline.version) ||
            !/^[a-f0-9]{64}$/u.test(baseline.packageDigest) ||
            !/^[a-f0-9]{64}$/u.test(baseline.resilienceKey)
        ) {
            throw new TypeError("Release verification baseline is invalid");
        }
        const coordinate = `${baseline.version}\0${baseline.packageDigest}`;
        if (coordinates.has(coordinate)) {
            throw new TypeError("Release verification baselines must be unique");
        }
        coordinates.add(coordinate);
    }
    const names = new Set<string>();
    for (const fixture of input.fixtures ?? []) {
        if (!fixture.name.trim() || names.has(fixture.name) || !isSupportedIntegrationVersionRange(fixture.from)) {
            throw new TypeError("Release verification fixture plan is invalid");
        }
        names.add(fixture.name);
    }
}
