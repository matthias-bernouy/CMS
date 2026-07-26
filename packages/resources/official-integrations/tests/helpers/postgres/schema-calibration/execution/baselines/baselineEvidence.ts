import { decodeIntegrationPackageFile } from "@bernouy/cms-integration-packages";
import type { OfficialBootstrapAnonymousConstraintGrandfathering } from "@bernouy/cms-integration-registry";
import { identifyObservedSchemaContract, type ObservedSchemaContractV1 } from "@bernouy/cms-integrations";
import { lintAnonymousConstraints } from "@bernouy/cms-integrations/supabase";
import { parseReviewedSchemaBaseline, type ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";
import {
    OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
    OFFICIAL_SCHEMA_BASELINE_ENVIRONMENT_DIGEST,
    OFFICIAL_SCHEMA_BASELINE_GENERATED_AT,
    OFFICIAL_SCHEMA_BASELINE_GENERATOR,
    OFFICIAL_SCHEMA_BASELINE_POLICY,
    OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION,
    OFFICIAL_SCHEMA_BASELINE_PROVENANCE_ACTOR,
    type OfficialRepositoryBootstrapEvidenceV1,
} from "@bernouy/cms-official-integrations/publication";
import type { OfficialSchemaCalibrationSubject } from "../../subjects";
import type { OfficialIntegrationSchemaCalibrationEvidence } from "../calibration";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const EXPECTED_LEGACY_FINDINGS = Object.freeze({
    commerce: 23,
    "commerce-negotiation": 1,
    emailer: 3,
    "mondial-relay": 1,
    "photo-albums": 2,
    "stripe-connect": 29,
});

export async function buildOfficialRepositoryBootstrapEvidence(
    calibration: OfficialIntegrationSchemaCalibrationEvidence,
): Promise<OfficialRepositoryBootstrapEvidenceV1> {
    assertCalibrationEnvironment(calibration);
    const reviewedSchemaBaselines = await Promise.all(
        calibration.observations.map(({ subject, observedSchema }) =>
            baseline(subject, observedSchema, calibration.report.environment.postgresVersion),
        ),
    );
    const anonymousConstraintGrandfathering = calibration.observations.flatMap(({ subject }) =>
        grandfatheredConstraints(subject),
    );
    assertLegacyFindingInventory(
        anonymousConstraintGrandfathering,
        calibration.observations.map(({ subject }) => subject),
    );
    return {
        schema: "cms.integration.official-bootstrap-evidence.v1",
        reviewedSchemaBaselines: reviewedSchemaBaselines.sort(compareBaselines),
        anonymousConstraintGrandfathering: anonymousConstraintGrandfathering.sort(compareGrandfathering),
    };
}

async function baseline(
    subject: OfficialSchemaCalibrationSubject,
    observedSchema: ObservedSchemaContractV1,
    postgresVersion: string,
): Promise<ReviewedSchemaBaselineV1> {
    const observedSchemaDigest = (await identifyObservedSchemaContract(observedSchema)).digest;
    return parseReviewedSchemaBaseline({
        schema: "cms.integration.reviewed-schema-baseline.v1",
        reportId: `official-schema-baseline/${subject.kind}/${subject.version}/${subject.connectorKey}/v1`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: OFFICIAL_SCHEMA_BASELINE_GENERATED_AT,
        kind: subject.kind,
        version: subject.version,
        packageDigest: subject.digest,
        connectorKey: subject.connectorKey,
        lineageId: subject.lineageId,
        legacySelector: {
            provider: subject.connector.provider,
            ...(subject.connector.root ? { root: subject.connector.root } : {}),
        },
        dependencies: subject.dependencies
            .map(({ kind, version, digest }) => ({ kind, version, packageDigest: digest }))
            .sort(compareDependencies),
        observedSchema,
        observedSchemaDigest,
        generator: OFFICIAL_SCHEMA_BASELINE_GENERATOR,
        environment: {
            digest: OFFICIAL_SCHEMA_BASELINE_ENVIRONMENT_DIGEST,
            postgresVersion,
        },
        policy: OFFICIAL_SCHEMA_BASELINE_POLICY,
        generatedAt: OFFICIAL_SCHEMA_BASELINE_GENERATED_AT,
        provenance: {
            actor: OFFICIAL_SCHEMA_BASELINE_PROVENANCE_ACTOR,
            reason: "Reviewed legacy baseline generated from the pinned official PostgreSQL calibration.",
            evidenceIds: [`observed-schema-${observedSchemaDigest}`],
        },
    });
}

function assertCalibrationEnvironment(calibration: OfficialIntegrationSchemaCalibrationEvidence): void {
    const { environment } = calibration.report;
    if (
        environment.digest !== OFFICIAL_SCHEMA_BASELINE_ENVIRONMENT_DIGEST ||
        environment.image !==
            "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777" ||
        environment.postgresVersion !== OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION
    ) {
        throw new Error("Official reviewed baselines require the approved pinned PostgreSQL environment");
    }
    if (
        OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL.generator !== OFFICIAL_SCHEMA_BASELINE_GENERATOR ||
        OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL.policy !== OFFICIAL_SCHEMA_BASELINE_POLICY
    ) {
        throw new Error("Official reviewed baseline approval constants diverged");
    }
}

function grandfatheredConstraints(
    subject: OfficialSchemaCalibrationSubject,
): OfficialBootstrapAnonymousConstraintGrandfathering[] {
    return Object.entries(subject.package.envelope.files).flatMap(([path, file]) => {
        if (!path.endsWith(".sql")) {
            return [];
        }
        const findings = lintAnonymousConstraints(utf8.decode(decodeIntegrationPackageFile(file)), path);
        return findings.length === 0 ? [] : [{ packageDigest: subject.digest, path, findings }];
    });
}

function assertLegacyFindingInventory(
    entries: readonly OfficialBootstrapAnonymousConstraintGrandfathering[],
    subjects: readonly OfficialSchemaCalibrationSubject[],
): void {
    const kindByDigest = new Map(subjects.map((subject) => [subject.digest, subject.kind]));
    const counts = new Map<string, number>();
    for (const entry of entries) {
        const kind = kindByDigest.get(entry.packageDigest);
        if (!kind) {
            throw new Error("Anonymous constraint inventory references an unknown calibration package");
        }
        counts.set(kind, (counts.get(kind) ?? 0) + entry.findings.length);
    }
    const expected = Object.entries(EXPECTED_LEGACY_FINDINGS);
    if (
        counts.size !== expected.length ||
        expected.some(([kind, count]) => counts.get(kind) !== count) ||
        [...counts.values()].reduce((total, count) => total + count, 0) !== 59
    ) {
        throw new Error("Official anonymous constraint inventory changed without explicit grandfathering review");
    }
}

function compareBaselines(left: ReviewedSchemaBaselineV1, right: ReviewedSchemaBaselineV1): number {
    return (
        compareText(left.kind, right.kind) ||
        compareText(left.version, right.version) ||
        compareText(left.connectorKey, right.connectorKey)
    );
}

function compareGrandfathering(
    left: OfficialBootstrapAnonymousConstraintGrandfathering,
    right: OfficialBootstrapAnonymousConstraintGrandfathering,
): number {
    return compareText(left.packageDigest, right.packageDigest) || compareText(left.path, right.path);
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

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
