import { canonicalJsonBytes, sha256Hex, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { createHash } from "node:crypto";
import {
    identifyOfficialRepositoryBootstrapPlan,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    IntegrationRegistryCatalogSnapshotReference,
    OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA,
    type OfficialBootstrapAnonymousConstraintGrandfathering,
    type OfficialRepositoryBootstrapBaselineApproval,
    type OfficialRepositoryBootstrapPlan,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsOfficialIntegrationRegistryBootstrapPublisher,
} from "@bernouy/cms-integration-registry/fs";
import { identifyObservedSchemaContract, type IntegrationDependency } from "@bernouy/cms-integrations";
import { lintAnonymousConstraints } from "@bernouy/cms-integrations/supabase";
import {
    parseReviewedSchemaBaseline,
    type CompatibilityReportV2,
    type ReleaseAdmissionDecision,
    type ReviewedSchemaBaselineV1,
    type StatefulChangeSelectionV1,
    type VerificationReport,
} from "@bernouy/cms-integration-verification";
import { publicationPackage, registryFixture } from "../fixtures";

export const APPROVED_ENVIRONMENT_DIGEST = "b".repeat(64);
export const BASELINE_APPROVAL: OfficialRepositoryBootstrapBaselineApproval = Object.freeze({
    generator: { name: "cms-schema-generator", version: "1.0.0", imageDigest: `sha256:${"c".repeat(64)}` },
    environments: [{ digest: APPROVED_ENVIRONMENT_DIGEST, postgresVersion: "16.14" }],
    policy: { name: "legacy-schema-baseline", version: "1.0.0" },
    provenanceActors: ["official-integrations-ci"],
});

export function bootstrapPublisher(fixture: ReturnType<typeof registryFixture>) {
    return new FsOfficialIntegrationRegistryBootstrapPublisher({
        root: fixture.root,
        snapshots: fixture.snapshots,
        compatibility: fixture.compatibility,
        mutations: fixture.mutations,
        baselineApproval: BASELINE_APPROVAL,
        now: () => "2026-07-26T10:00:00.000Z",
    });
}

export async function restartedBootstrapPublisher(root: string) {
    const snapshots = new IntegrationRegistryCatalogSnapshotReference(
        await buildFsIntegrationRegistryCatalogSnapshot({ root }),
    );
    let sequence = 0;
    return new FsOfficialIntegrationRegistryBootstrapPublisher({
        root,
        snapshots,
        compatibility: new IntegrationCompatibilityEvaluator({
            identity: { name: "restart-test", version: "1.0.0" },
            now: () => "2026-07-26T10:00:00.000Z",
            createReportId: () => `restart-report-${++sequence}`,
        }),
        mutations: new InMemoryIntegrationRegistryMutationCoordinator(),
        baselineApproval: BASELINE_APPROVAL,
        now: () => "2026-07-26T10:00:00.000Z",
    });
}

export async function legacySqlPackage(
    kind: string,
    version = "1.0.0",
    dependencies: readonly IntegrationDependency[] = [],
): Promise<ResolvedIntegrationPackage> {
    return await publicationPackage(kind, version, {
        ...(dependencies.length > 0 ? { dependencies } : {}),
        connectors: [sqlConnector()],
    });
}

export function sqlConnector(root = "connectors/supabase") {
    return {
        provider: "supabase",
        root,
        schemas: [{ manifest: "sql/schema.manifest.json" }],
    };
}

export async function reviewedBaseline(
    integrationPackage: ResolvedIntegrationPackage,
    overrides: Readonly<{
        dependencies?: ReviewedSchemaBaselineV1["dependencies"];
        environmentDigest?: string;
        postgresVersion?: string;
        selectorRoot?: string;
        reason?: string;
    }> = {},
): Promise<ReviewedSchemaBaselineV1> {
    const kind = integrationPackage.envelope.kind;
    const observedSchema = {
        schema: "cms.integration.observed-schema.v1",
        owner: { connectorKey: "primary", lineageId: `${kind}-supabase-v1` },
        namespaces: [{ name: "public", relations: [] }],
    } as const;
    return await parseReviewedSchemaBaseline({
        schema: "cms.integration.reviewed-schema-baseline.v1",
        reportId: `baseline-${kind}`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T10:00:00.000Z",
        kind,
        version: integrationPackage.envelope.version,
        packageDigest: integrationPackage.digest,
        connectorKey: "primary",
        lineageId: `${kind}-supabase-v1`,
        legacySelector: { provider: "supabase", root: overrides.selectorRoot ?? "connectors/supabase" },
        dependencies: overrides.dependencies ?? [],
        observedSchema,
        observedSchemaDigest: (await identifyObservedSchemaContract(observedSchema)).digest,
        generator: BASELINE_APPROVAL.generator,
        environment: {
            digest: overrides.environmentDigest ?? APPROVED_ENVIRONMENT_DIGEST,
            postgresVersion: overrides.postgresVersion ?? "16.14",
        },
        policy: BASELINE_APPROVAL.policy,
        generatedAt: "2026-07-26T10:00:00.000Z",
        provenance: {
            actor: "official-integrations-ci",
            reason: overrides.reason ?? "Pinned reviewed schema observation.",
            evidenceIds: [`observed-${kind}`],
        },
    });
}

export function bootstrapPlan(
    packages: readonly ResolvedIntegrationPackage[],
    baselines: readonly ReviewedSchemaBaselineV1[] = [],
    grandfathering: ReadonlyMap<string, readonly OfficialBootstrapAnonymousConstraintGrandfathering[]> = new Map(),
): OfficialRepositoryBootstrapPlan {
    return {
        schema: OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA,
        packages: packages.map((integrationPackage) => ({
            package: integrationPackage,
            anonymousConstraintGrandfathering: grandfathering.get(integrationPackage.digest) ?? [],
        })),
        reviewedSchemaBaselines: baselines,
        verificationBackfills: packages.map(verificationBackfill),
    };
}

function verificationBackfill(integrationPackage: ResolvedIntegrationPackage) {
    const kind = integrationPackage.envelope.kind;
    const version = integrationPackage.envelope.version;
    const packageDigest = integrationPackage.digest;
    const policy = { name: "bootstrap-test", version: "1.0.0" } as const;
    const policySnapshotDigest = "d".repeat(64);
    const verificationEnvelope = {
        schema: "cms.integration.verification.v1" as const,
        target: { kind, version, packageDigest },
        manifest: {
            runnerRequirements: [{ name: "bootstrap-test", versionRange: "1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
        },
        files: {},
    };
    const verificationDigest = syncDigest(verificationEnvelope);
    const compatibilityReport: CompatibilityReportV2 = {
        schema: "cms.integration.compatibility-report.v2",
        reportId: `compatibility-${kind}`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T10:00:00.000Z",
        kind,
        version,
        packageDigest,
        evaluator: { name: "bootstrap-test-compatibility", version: "1.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: true,
        noBaselineReason: "new-kind",
        provenance: { actor: "bootstrap-test", reason: "Initial fixture version." },
    };
    const compatibilityDigest = syncDigest(compatibilityReport);
    const statefulChanges: StatefulChangeSelectionV1 = {
        schema: "cms.integration.stateful-change-selection.v1",
        selector: policy,
        policySnapshotDigest,
        target: { kind, version, packageDigest },
        compatibilityReport: { revisionId: compatibilityReport.reportId, reportDigest: compatibilityDigest },
        requiredMigrations: [],
    };
    const statefulChangeSelectionDigest = syncDigest(statefulChanges);
    const result = {
        suiteId: "package-contract-validation",
        source: "platform" as const,
        required: true,
        outcome: "passed" as const,
        durationMs: 0,
        attempts: 1,
        cacheHit: false,
        evidenceDigests: [packageDigest],
        diagnostics: [],
    };
    const verificationReport: VerificationReport = {
        schema: "cms.integration.verification-report.v1",
        reportId: `verification-${kind}`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T10:00:00.000Z",
        kind,
        version,
        packageDigest,
        verificationDigest,
        runner: { name: "bootstrap-test", version: "1.0.0", imageDigest: `sha256:${"a".repeat(64)}` },
        policy,
        policySnapshotDigest,
        admissionInputDigest: "a".repeat(64),
        verificationJobResultDigest: syncDigest([result]),
        dependencies: [],
        baselines: [],
        activeContracts: [],
        environment: { digest: "b".repeat(64), versions: { bun: "1.3.14" } },
        results: [result],
        outcome: "passed",
        provenance: { actor: "bootstrap-test", reason: "Strict package fixture validation." },
    };
    const verificationReportDigest = syncDigest(verificationReport);
    const decision: ReleaseAdmissionDecision = {
        schema: "cms.integration.release-admission-decision.v1",
        decisionId: `decision-${kind}`,
        revisionType: "root",
        kind,
        version,
        packageDigest,
        compatibilityReport: { revisionId: compatibilityReport.reportId, reportDigest: compatibilityDigest },
        verificationReport: { revisionId: verificationReport.reportId, reportDigest: verificationReportDigest },
        migrationReports: [],
        policy,
        policySnapshotDigest,
        statefulChanges,
        statefulChangeSelectionDigest,
        admissible: true,
        reasons: [],
        createdAt: "2026-07-26T10:00:00.000Z",
        provenance: { actor: "bootstrap-test", reason: "Exact fixture decision." },
    };
    return {
        verification: {
            envelope: verificationEnvelope,
            canonicalBytes: canonicalJsonBytes(verificationEnvelope),
            digest: verificationDigest,
        },
        compatibilityReport,
        verificationReport,
        statefulChanges,
        decision,
    };
}

function syncDigest(value: unknown): string {
    return createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
}

export async function anonymousSqlPackage(kind: string): Promise<ResolvedIntegrationPackage> {
    const original = await legacySqlPackage(kind);
    const envelope = {
        ...original.envelope,
        files: {
            ...original.envelope.files,
            "sql/schema.sql": {
                encoding: "utf8" as const,
                content: "CREATE TABLE items (id bigint CHECK (id > 0));\n",
            },
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export function grandfatheringFor(
    integrationPackage: ResolvedIntegrationPackage,
): OfficialBootstrapAnonymousConstraintGrandfathering {
    const path = "sql/schema.sql";
    return {
        packageDigest: integrationPackage.digest,
        path,
        findings: lintAnonymousConstraints("CREATE TABLE items (id bigint CHECK (id > 0));\n", path),
    };
}

export { identifyOfficialRepositoryBootstrapPlan, registryFixture };
