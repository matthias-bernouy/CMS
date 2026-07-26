import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { IntegrationCompatibilityEvaluator } from "@bernouy/cms-integration-registry";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationCompatibilityReportStore,
    FsIntegrationRegistryVersionEligibilityManager,
    FsReleaseAdmissionReconciler,
} from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../baselines/fixtures";
import { publicationPackage, registryFixture, seedLegacySqlBaseline } from "../publication/fixtures";
import type { releaseStores } from "../reports/fixtures/stores";

export function reevaluationServices(
    fixture: ReturnType<typeof registryFixture>,
    evaluator: IntegrationCompatibilityEvaluator = fixture.compatibility,
) {
    const reports = new FsIntegrationCompatibilityReportStore({
        snapshots: fixture.snapshots,
        mutations: fixture.mutations,
    });
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
    const reports = new FsIntegrationCompatibilityReportStore({
        snapshots: fixture.snapshots,
        mutations: fixture.mutations,
    });
    const eligibility = new FsIntegrationRegistryVersionEligibilityManager({
        root: fixture.root,
        snapshots: fixture.snapshots,
        decisions: stores.decisions,
        mutations: fixture.mutations,
    });
    const reconciler = new FsReleaseAdmissionReconciler({
        snapshots: fixture.snapshots,
        compatibility: stores.compatibilityReports,
        legacyCompatibility: reports,
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
        release: { compatibility: stores.compatibilityReports, decisions: stores.decisions, reconciler },
    });
    return { eligibility, reconciler, reevaluator, reports };
}

export async function publishVersionPair(fixture: ReturnType<typeof registryFixture>) {
    const baseline = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
    const candidate = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
    return { baseline, candidate };
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
    return { source, candidate };
}

export function reevaluationRequest(currentReportRevisionId: string) {
    return {
        kind: "demo",
        version: "1.1.0",
        currentReportRevisionId,
        actor: "admin:user-1",
        reason: "Run the current compatibility evaluator",
        evidenceIds: ["schema-ci-2", "schema-ci-1"],
    };
}

export function rewriteAdmission(
    root: string,
    version: string,
    transform: (report: Record<string, unknown>) => void,
): void {
    const path = join(root, "demo", ".registry", "reports", version, "admission.json");
    const document = JSON.parse(readFileSync(path, "utf8")) as { report: Record<string, unknown> };
    transform(document.report);
    chmodSync(path, 0o640);
    writeFileSync(path, canonicalJsonBytes(document));
    chmodSync(path, 0o440);
}
