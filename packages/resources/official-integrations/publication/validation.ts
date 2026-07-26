import type { ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";
import type { DeclarativeConnectorTemplate } from "@bernouy/cms-integrations";
import {
    OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
    OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS,
    type BuiltOfficialIntegrationPackage,
    type OfficialRepositoryBootstrapEvidenceV1,
} from "./contracts";
import { assertAnonymousConstraintGrandfathering } from "./constraints";
import { resolveOfficialIntegrationDependencies } from "./dependencies";
import { compareText } from "./filesystem";

export function assertOfficialRepositoryBootstrapEvidence(
    packages: readonly BuiltOfficialIntegrationPackage[],
    evidence: OfficialRepositoryBootstrapEvidenceV1,
): void {
    const packagesByIdentity = new Map(packages.map((entry) => [packageIdentity(entry.kind, entry.version), entry]));
    const packagesByDigest = new Map(packages.map((entry) => [entry.digest, entry]));
    if (packagesByIdentity.size !== packages.length || packagesByDigest.size !== packages.length) {
        throw new Error("Official repository bootstrap package identities and digests must be unique");
    }
    const expectedSqlPackages = new Set(
        OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS.map(({ kind, version }) => packageIdentity(kind, version)),
    );
    const actualSqlPackages = packages.filter((entry) => sqlConnector(entry) !== null);
    if (
        actualSqlPackages.length !== expectedSqlPackages.size ||
        actualSqlPackages.some((entry) => !expectedSqlPackages.has(packageIdentity(entry.kind, entry.version)))
    ) {
        throw new Error("Official repository bootstrap SQL packages must match the closed baseline inventory");
    }
    const expectedBaselines = new Map(
        OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS.map((target) => [baselineIdentity(target), target]),
    );
    const actualBaselines = new Set<string>();
    let previousBaseline = "";
    for (const baseline of evidence.reviewedSchemaBaselines) {
        const identity = baselineIdentity(baseline);
        if (
            !expectedBaselines.has(identity) ||
            actualBaselines.has(identity) ||
            (previousBaseline && compareText(previousBaseline, identity) >= 0)
        ) {
            throw new Error("Official repository bootstrap baselines must match the closed SQL connector inventory");
        }
        actualBaselines.add(identity);
        previousBaseline = identity;
        const integrationPackage = packagesByIdentity.get(packageIdentity(baseline.kind, baseline.version));
        if (!integrationPackage || integrationPackage.digest !== baseline.packageDigest) {
            throw new Error("Official repository bootstrap baseline must match its exact package digest");
        }
        assertApprovedBaseline(baseline, integrationPackage, packages, packagesByIdentity);
    }
    if (actualBaselines.size !== expectedBaselines.size) {
        throw new Error("Official repository bootstrap requires exactly one baseline for every SQL connector identity");
    }
    assertAnonymousConstraintGrandfathering(packages, packagesByDigest, evidence.anonymousConstraintGrandfathering);
}

function assertApprovedBaseline(
    baseline: ReviewedSchemaBaselineV1,
    integrationPackage: BuiltOfficialIntegrationPackage,
    packages: readonly BuiltOfficialIntegrationPackage[],
    packagesByIdentity: ReadonlyMap<string, BuiltOfficialIntegrationPackage>,
): void {
    const approval = OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL;
    if (
        baseline.generator.name !== approval.generator.name ||
        baseline.generator.version !== approval.generator.version ||
        baseline.generator.imageDigest !== approval.generator.imageDigest ||
        !approval.environments.some(
            (environment) =>
                environment.digest === baseline.environment.digest &&
                environment.postgresVersion === baseline.environment.postgresVersion,
        ) ||
        baseline.policy.name !== approval.policy.name ||
        baseline.policy.version !== approval.policy.version ||
        !approval.provenanceActors.includes(baseline.provenance.actor) ||
        baseline.origin !== "legacy-backfill" ||
        baseline.revisionType !== "root" ||
        baseline.supersedes !== undefined
    ) {
        throw new Error("Official repository bootstrap baseline provenance is not approved");
    }
    const connector = sqlConnector(integrationPackage);
    if (
        !connector ||
        baseline.legacySelector.provider !== connector.provider ||
        baseline.legacySelector.root !== connector.root
    ) {
        throw new Error("Official repository bootstrap baseline selector must match the exact SQL connector");
    }
    const expectedDependencies = resolveOfficialIntegrationDependencies(integrationPackage.definition, packages)
        .map(({ kind, version, digest }) => ({ kind, version, packageDigest: digest }))
        .sort(compareDependencies);
    if (baseline.dependencies.length !== expectedDependencies.length) {
        throw new Error("Official repository bootstrap baseline dependencies are incomplete");
    }
    for (const [index, dependency] of baseline.dependencies.entries()) {
        const identity = packageIdentity(dependency.kind, dependency.version);
        const integrationPackage = packagesByIdentity.get(identity);
        const expected = expectedDependencies[index];
        if (
            !integrationPackage ||
            integrationPackage.digest !== dependency.packageDigest ||
            expected?.kind !== dependency.kind ||
            expected.version !== dependency.version ||
            expected.packageDigest !== dependency.packageDigest
        ) {
            throw new Error("Official repository bootstrap baseline dependencies differ from the exact package graph");
        }
    }
}

function sqlConnector(integrationPackage: BuiltOfficialIntegrationPackage): DeclarativeConnectorTemplate | null {
    const connectors = (integrationPackage.definition.connectors ?? []).filter(
        (connector) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0,
    );
    if (connectors.length > 1) {
        throw new Error("Official repository bootstrap package has several SQL connectors without stable keys");
    }
    return connectors[0] ?? null;
}

function packageIdentity(kind: string, version: string): string {
    return `${kind}\0${version}`;
}

function baselineIdentity(
    value: Readonly<{ kind: string; version: string; connectorKey: string; lineageId: string }>,
): string {
    return `${value.kind}\0${value.version}\0${value.connectorKey}\0${value.lineageId}`;
}

function compareDependencies(
    left: Readonly<{ kind: string; version: string; packageDigest: string }>,
    right: Readonly<{ kind: string; version: string; packageDigest: string }>,
): number {
    return (
        compareText(left.kind, right.kind) ||
        compareText(left.version, right.version) ||
        compareText(left.packageDigest, right.packageDigest)
    );
}
