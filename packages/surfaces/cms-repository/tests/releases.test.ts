import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryReleaseEvidence } from "@bernouy/cms-integration-registry";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { RepositoryCms } from "cms-repository/RepositoryCms";
import { TestRunner } from "./testRunner";

const PACKAGE_DIGEST = "a".repeat(64);
const VERIFICATION_DIGEST = "b".repeat(64);
const REPORT_DIGEST = "c".repeat(64);

describe("@bernouy/cms-repository public release evidence", () => {
    test("projects exact composite evidence without private provenance", async () => {
        const runner = mounted(releaseEvidence());
        const response = await runner.handle("/api/integrations/release?kind=demo&version=1.0.0");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(body).toMatchObject({
            kind: "demo",
            version: "1.0.0",
            packageDigest: PACKAGE_DIGEST,
            verificationDigest: VERIFICATION_DIGEST,
            status: "installable",
            installable: true,
            freshInstallOnly: false,
            compatibility: { origin: "legacy-backfill", contractAdmissible: true },
            verification: {
                origin: "legacy-backfill",
                outcome: "passed",
                runner: { name: "cms-schema-generator", imageDigest: "sha256:pinned" },
            },
            migrations: [
                {
                    runner: { name: "cms-postgres-migration", imageDigest: "sha256:migration" },
                    environmentDigest: REPORT_DIGEST,
                    checks: { freshInstall: { outcome: "passed", evidenceDigest: REPORT_DIGEST } },
                    operationalEvidence: {
                        downtime: { status: "not-measured" },
                        drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
                        rollback: { capability: "available", verified: true, evidenceDigest: REPORT_DIGEST },
                        pointOfNoReturn: {
                            phase: "cleanup",
                            observation: "crossed",
                            evidenceDigest: REPORT_DIGEST,
                        },
                        cleanup: { delaySeconds: 60, observed: true, evidenceDigest: REPORT_DIGEST },
                    },
                },
            ],
            decision: { admissible: true, reasons: [] },
        });
        expect(JSON.stringify(body)).not.toContain("private-actor");
    });

    test("keeps blocked evidence visible while marking it non-installable", async () => {
        const runner = mounted({ ...releaseEvidence(), status: "blocked" });
        const body = await (await runner.handle("/api/integrations/release?kind=demo&version=1.0.0")).json();

        expect(body.status).toBe("blocked");
        expect(body.installable).toBe(false);
        expect(body.packageDigest).toBe(PACKAGE_DIGEST);
        expect(body.decision.admissible).toBe(true);
    });

    test("marks a major without any passed migration path as fresh-install-only", async () => {
        const source = releaseEvidence();
        const compatibility = source.compatibility!;
        const compatibilityCurrent = { ...compatibility.current, releaseLevel: "major" as const };
        const decision = source.decision!;
        const decisionCurrent = {
            ...decision.current,
            migrationReports: [],
            statefulChanges: { ...decision.current.statefulChanges, requiredMigrations: [] },
        };
        const runner = mounted({
            ...source,
            migrations: [],
            compatibility: { ...compatibility, current: compatibilityCurrent, revisions: [compatibilityCurrent] },
            decision: { ...decision, current: decisionCurrent, revisions: [decisionCurrent] },
        });

        const body = await (await runner.handle("/api/integrations/release?kind=demo&version=1.0.0")).json();

        expect(body.installable).toBe(true);
        expect(body.freshInstallOnly).toBe(true);
    });

    test("serves immutable verification bundles by exact digest", async () => {
        const canonicalBytes = canonicalJsonBytes({ schema: "test.verification.v1" });
        const digest = await sha256Hex(canonicalBytes);
        const runner = mounted(releaseEvidence(), {
            get: async (requested) =>
                requested === digest ? ({ envelope: {} as never, canonicalBytes, digest } as const) : null,
        });
        const path = `/api/integrations/verification-bundle?digest=${digest}`;

        const get = await runner.handle(path);
        const head = await runner.handle(path, { method: "HEAD" });

        expect(new Uint8Array(await get.arrayBuffer())).toEqual(canonicalBytes);
        expect(get.headers.get("etag")).toBe(`"${digest}"`);
        expect(get.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(get.headers.get("access-control-allow-origin")).toBe("*");
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        expect((await runner.handle("/api/integrations/verification-bundle?digest=invalid")).status).toBe(400);
    });
});

function mounted(
    release: IntegrationRegistryReleaseEvidence,
    bundles?: Readonly<{
        get(digest: string): Promise<Readonly<{ envelope: never; canonicalBytes: Uint8Array; digest: string }> | null>;
    }>,
): TestRunner {
    const runner = new TestRunner();
    new RepositoryCms({
        runner,
        integrationCatalog: emptyCatalog(),
        integrationReleases: {
            get: async (kind, version) => (kind === "demo" && version === "1.0.0" ? release : null),
        },
        ...(bundles ? { integrationVerificationBundles: bundles } : {}),
    });
    return runner;
}

function releaseEvidence(): IntegrationRegistryReleaseEvidence {
    const compatibility = {
        schema: "cms.integration.compatibility-report.v2" as const,
        reportId: "compatibility-1",
        revisionType: "root" as const,
        origin: "legacy-backfill" as const,
        createdAt: "2026-07-26T10:00:00.000Z",
        kind: "demo",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        evaluator: { name: "compatibility", version: "1.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [],
        outcome: "not-applicable" as const,
        requiredReleaseLevel: "none" as const,
        releaseLevel: "initial" as const,
        contractAdmissible: true,
        noBaselineReason: "new-kind" as const,
        provenance: { actor: "private-actor", reason: "Legacy backfill" },
    };
    const verification = {
        schema: "cms.integration.verification-report.v1" as const,
        reportId: "verification-1",
        revisionType: "root" as const,
        origin: "legacy-backfill" as const,
        createdAt: "2026-07-26T10:00:00.000Z",
        kind: "demo",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        verificationDigest: VERIFICATION_DIGEST,
        runner: { name: "cms-schema-generator", version: "1.0.0", imageDigest: "sha256:pinned" },
        policy: { name: "official", version: "1.0.0" },
        policySnapshotDigest: REPORT_DIGEST,
        admissionInputDigest: REPORT_DIGEST,
        verificationJobResultDigest: REPORT_DIGEST,
        dependencies: [],
        baselines: [],
        activeContracts: [],
        environment: { digest: REPORT_DIGEST, versions: { postgres: "16.9" } },
        results: [
            {
                suiteId: "sql-install-and-reapply",
                source: "platform" as const,
                required: true,
                outcome: "passed" as const,
                durationMs: 1,
                attempts: 1,
                cacheHit: false,
                evidenceDigests: [REPORT_DIGEST],
                diagnostics: [],
            },
        ],
        outcome: "passed" as const,
        provenance: { actor: "private-actor", reason: "Legacy backfill" },
    };
    const migration = {
        schema: "cms.integration.migration-report.v3" as const,
        reportId: "migration-1",
        revisionType: "root" as const,
        origin: "admission" as const,
        createdAt: "2026-07-26T10:00:00.000Z",
        source: { kind: "demo", version: "0.9.0", packageDigest: "d".repeat(64) },
        target: { kind: "demo", version: "1.0.0", packageDigest: PACKAGE_DIGEST },
        connectorKey: "primary",
        lineageId: "demo-supabase-v1",
        migrationRevision: 1,
        supportedSourceRange: "^0.9.0",
        runner: { name: "cms-postgres-migration", version: "1.0.0", imageDigest: "sha256:migration" },
        policy: { name: "official", version: "1.0.0" },
        policySnapshotDigest: REPORT_DIGEST,
        migrationInputDigest: REPORT_DIGEST,
        migrationJobResultDigest: REPORT_DIGEST,
        statefulChangeSelectionDigest: REPORT_DIGEST,
        environmentDigest: REPORT_DIGEST,
        checks: {
            freshInstall: { outcome: "passed" as const, evidenceDigest: REPORT_DIGEST },
            migratedState: { outcome: "passed" as const, evidenceDigest: REPORT_DIGEST },
            equivalence: { outcome: "passed" as const, evidenceDigest: REPORT_DIGEST },
            failureInjection: { outcome: "not-supported" as const },
            resumption: { outcome: "not-supported" as const },
        },
        cutover: { cmsMediated: "binding-revision" as const, providerDirect: "expand-in-code" as const },
        rollback: "available" as const,
        pointOfNoReturn: "cleanup",
        delayedCleanupVerified: true,
        outcome: "passed" as const,
        policyEvaluation: {
            releaseLevel: "minor" as const,
            applicable: true,
            satisfied: true,
            checks: [],
            reasons: [],
        },
        operationalEvidence: {
            downtime: { status: "not-measured" as const },
            drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
            rollback: { capability: "available" as const, verified: true, evidenceDigest: REPORT_DIGEST },
            pointOfNoReturn: {
                phase: "cleanup",
                observation: "crossed" as const,
                evidenceDigest: REPORT_DIGEST,
            },
            cleanup: { delaySeconds: 60, observed: true, evidenceDigest: REPORT_DIGEST },
        },
        provenance: { actor: "private-actor", reason: "Migration admission" },
    };
    const decision = {
        schema: "cms.integration.release-admission-decision.v1" as const,
        decisionId: "decision-1",
        revisionType: "root" as const,
        kind: "demo",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        compatibilityReport: { revisionId: compatibility.reportId, reportDigest: REPORT_DIGEST },
        verificationReport: { revisionId: verification.reportId, reportDigest: REPORT_DIGEST },
        migrationReports: [
            {
                revisionId: migration.reportId,
                reportDigest: REPORT_DIGEST,
                source: migration.source,
                connectorKey: migration.connectorKey,
                lineageId: migration.lineageId,
                migrationRevision: migration.migrationRevision,
            },
        ],
        policy: { name: "official", version: "1.0.0" },
        policySnapshotDigest: REPORT_DIGEST,
        statefulChanges: {
            schema: "cms.integration.stateful-change-selection.v1" as const,
            selector: { name: "official", version: "1.0.0" },
            policySnapshotDigest: REPORT_DIGEST,
            target: { kind: "demo", version: "1.0.0", packageDigest: PACKAGE_DIGEST },
            compatibilityReport: { revisionId: compatibility.reportId, reportDigest: REPORT_DIGEST },
            requiredMigrations: [
                {
                    source: migration.source,
                    connectorKey: migration.connectorKey,
                    lineageId: migration.lineageId,
                },
            ],
        },
        statefulChangeSelectionDigest: REPORT_DIGEST,
        admissible: true,
        reasons: [],
        createdAt: "2026-07-26T10:00:00.000Z",
        provenance: { actor: "private-actor", reason: "Legacy backfill" },
    };
    return {
        kind: "demo",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        verificationDigest: VERIFICATION_DIGEST,
        compatibility: history(compatibility),
        verification: history(verification),
        migrations: [history(migration)],
        decision: history(decision),
    };
}

function history<T extends { reportId?: string; decisionId?: string }>(current: T) {
    const revisionId = current.reportId ?? current.decisionId!;
    return { currentRevisionId: revisionId, currentReportDigest: REPORT_DIGEST, current, revisions: [current] };
}

function emptyCatalog(): IntegrationDefinitionRepository {
    return { list: async () => [], getIndex: async () => null, listVersions: async () => [], get: async () => null };
}
