import { chmodSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { identifyCompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import {
    IntegrationCompatibilityEvaluator,
    type IntegrationCompatibilityPackage,
    type ReleaseReportCurrentReference,
    type ReleaseReportHistory,
} from "@bernouy/cms-integration-registry";
import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationRegistryVersionEligibilityManager,
    FsReleaseAdmissionReconciler,
    loadReviewedConnectorSchemaBaselines,
} from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../baselines/fixtures";
import { publicationPackage, registryFixture, seedLegacySqlBaseline } from "../publication/fixtures";
import { releaseStores } from "../reports/fixtures/stores";

export function reevaluationServices(
    fixture: ReturnType<typeof registryFixture>,
    evaluator: IntegrationCompatibilityEvaluator = fixture.compatibility,
) {
    const reports = releaseStores(fixture).compatibilityReports;
    const reevaluator = new FsIntegrationCompatibilityReevaluator({
        snapshots: fixture.snapshots,
        reports,
        evaluator,
        reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
    });
    return { reports, reevaluator };
}

export function compositeReevaluationServices(
    fixture: ReturnType<typeof registryFixture>,
    stores: ReturnType<typeof releaseStores>,
    policy: Awaited<ReturnType<typeof import("./eligibility/decisionFixtures").appendDecision>>["policy"],
) {
    const reports = stores.compatibilityReports;
    const eligibility = new FsIntegrationRegistryVersionEligibilityManager({
        root: fixture.root,
        snapshots: fixture.snapshots,
        decisions: stores.decisions,
        mutations: fixture.mutations,
    });
    const reconciler = new FsReleaseAdmissionReconciler({
        snapshots: fixture.snapshots,
        compatibility: stores.compatibilityReports,
        verification: stores.verificationReports,
        migrations: stores.migrationReports,
        decisions: stores.decisions,
        eligibility,
        statefulChanges: { policy, reviewedSchemaBaselines: fixture.reviewedSchemaBaselines },
    });
    const evaluator = new IntegrationCompatibilityEvaluator({
        identity: { name: "registry-test", version: "1.0.0" },
        now: () => "2026-07-26T13:00:00.000Z",
        createReportId: () => "composite-reevaluation",
    });
    const reevaluator = new FsIntegrationCompatibilityReevaluator({
        snapshots: fixture.snapshots,
        reports,
        evaluator,
        reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
        release: { decisions: stores.decisions, reconciler },
    });
    return { eligibility, reconciler, reevaluator, reports };
}

export async function publishVersionPair(fixture: ReturnType<typeof registryFixture>) {
    const baseline = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
    const candidate = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
    const compatibility = await seedCompatibilityRoot(fixture, candidate.version, baseline.version);
    return { baseline, candidate, compatibility };
}

export async function publishMigrationAwareVersionPair(
    fixture: ReturnType<typeof registryFixture>,
    candidateSchema: unknown,
) {
    const source = await seedLegacySqlBaseline(fixture);
    await fixture.reviewedSchemaBaselines.append({
        baseline: await reviewedBaseline("demo-migration-baseline", {
            kind: "demo",
            packageDigest: source.digest,
        }),
        expectedCurrentRevisionId: null,
    });
    const checksum = `sha256:${"a".repeat(64)}`;
    const candidate = await fixture.publisher.publish({
        package: await publicationPackage(
            "demo",
            "1.1.0",
            {
                connectors: [
                    {
                        provider: "supabase",
                        connectorKey: "primary",
                        lineageId: "demo-supabase-v1",
                        migrationRevision: 2,
                        root: "connectors/supabase",
                        schemas: [{ path: "install/schema.sql" }],
                        compatibility: { schema: candidateSchema },
                        migration: {
                            install: {
                                revision: 2,
                                digest: `sha256:${"b".repeat(64)}`,
                                coveredMigrations: [{ id: "add-items", checksum, revision: 2, introducedIn: "1.1.0" }],
                            },
                            migrations: [
                                {
                                    id: "add-items",
                                    checksum,
                                    fromRevision: 1,
                                    toRevision: 2,
                                    introducedIn: "1.1.0",
                                    transaction: "atomic",
                                    phase: "expand",
                                    path: "migrations/0002-add-items.sql",
                                },
                            ],
                            supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
                            pointOfNoReturn: "before-contract",
                        },
                    },
                ],
            },
            "migration-aware implementation\n",
            {
                "connectors/supabase/install/schema.sql": {
                    encoding: "utf8",
                    content: "create schema if not exists public;\n",
                },
                "connectors/supabase/migrations/0002-add-items.sql": {
                    encoding: "utf8",
                    content: "create table if not exists public.items(id bigint primary key);\n",
                },
            },
        ),
    });
    const compatibility = await seedCompatibilityRoot(fixture, candidate.version, source.envelope.version);
    return { source, candidate, compatibility };
}

export async function seedCompatibilityRoot(
    fixture: ReturnType<typeof registryFixture>,
    version: string,
    baselineVersion?: string,
) {
    const candidate = await compatibilityPackage(fixture, version);
    const input = baselineVersion
        ? { baseline: await compatibilityPackage(fixture, baselineVersion), candidate }
        : { candidate, noBaselineReason: "new-kind" as const };
    const root = await fixture.compatibility.buildRoot(input, "admission", {
        actor: "repository-admission",
        reason: "candidate-static-evaluation",
    });
    return await releaseStores(fixture).compatibilityReports.append({ report: root.report, expectedCurrent: null });
}

export function reevaluationRequest(
    current: ReleaseReportCurrentReference | ReleaseReportHistory<CompatibilityReportV2>,
) {
    const currentReport =
        "currentRevisionId" in current
            ? { revisionId: current.currentRevisionId, reportDigest: current.currentReportDigest }
            : current;
    return {
        kind: "demo",
        version: "1.1.0",
        currentReport,
        actor: "admin:user-1",
        reason: "Run the current compatibility evaluator",
        evidenceIds: ["schema-ci-2", "schema-ci-1"],
    };
}

export async function rewriteCompatibilityRoot(
    root: string,
    version: string,
    transform: (report: Record<string, unknown>) => void,
    identify = true,
): Promise<void> {
    const streamRoot = join(root, ".registry", "release-reports", "compatibility");
    const history = readdirSync(streamRoot).find((entry) => {
        const identity = JSON.parse(readFileSync(join(streamRoot, entry, "identity.json"), "utf8")) as {
            key?: { kind?: string; version?: string };
        };
        return identity.key?.kind === "demo" && identity.key.version === version;
    });
    if (!history) {
        throw new Error(`Compatibility history was not found for demo@${version}`);
    }
    const path = join(streamRoot, history, "revisions", "0000000001.json");
    const document = JSON.parse(readFileSync(path, "utf8")) as {
        report: Record<string, unknown>;
        reportDigest: string;
    };
    transform(document.report);
    if (identify) {
        const identified = await identifyCompatibilityReportV2(document.report);
        document.report = identified.report;
        document.reportDigest = identified.digest;
    }
    chmodSync(path, 0o640);
    writeFileSync(path, canonicalJsonBytes(document));
    chmodSync(path, 0o440);
}

async function compatibilityPackage(
    fixture: ReturnType<typeof registryFixture>,
    version: string,
): Promise<IntegrationCompatibilityPackage> {
    const location = fixture.snapshots.current().locateExactVersion("demo", version);
    if (!location) {
        throw new Error(`Published integration demo@${version} was not found`);
    }
    const reviewedSchemaBaselines = await loadReviewedConnectorSchemaBaselines(
        fixture.reviewedSchemaBaselines,
        "demo",
        version,
        location.package.digest,
    );
    return {
        definition: location.definitionSnapshot,
        packageDigest: location.package.digest,
        ...(reviewedSchemaBaselines.length > 0 ? { reviewedSchemaBaselines } : {}),
    };
}
