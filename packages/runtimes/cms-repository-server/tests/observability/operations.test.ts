import { describe, expect, test } from "bun:test";
import type {
    IntegrationCompatibilityAdmissionReport,
    IntegrationCompatibilityReportRevision,
} from "@bernouy/cms-integration-registry";
import { ObservedIntegrationRegistryStablePromoter } from "../../src/core/observability/promoter";
import { ObservedIntegrationCompatibilityReevaluator } from "../../src/core/observability/reevaluator";
import {
    createConsoleRepositoryOperationLogSink,
    RepositoryOperationalTelemetry,
} from "../../src/core/observability/telemetry";

describe("repository operation observability", () => {
    test("records bounded structured success logs without actors, reasons, credentials or paths", async () => {
        const lines: string[] = [];
        let elapsed = 0;
        const telemetry = new RepositoryOperationalTelemetry({
            now: () => new Date("2026-07-26T12:00:00.000Z"),
            durationNow: () => elapsed,
            createOperationId: () => "telemetry-operation",
            log: createConsoleRepositoryOperationLogSink((line) => lines.push(line)),
        });
        const admission = report(true);
        const promotion = new ObservedIntegrationRegistryStablePromoter(
            {
                promoteStable: async (request) => {
                    elapsed = 7;
                    return {
                        operationId: "promotion-operation",
                        record: {
                            schema: "cms.integration.registry.stable-promotion.v2",
                            id: "promotion-record",
                            operationId: "promotion-operation",
                            kind: request.kind,
                            version: request.version,
                            packageDigest: DIGEST,
                            reportRevisionId: request.currentReportRevisionId,
                            reportDigest: "b".repeat(64),
                            reportType: "release-admission-decision",
                            actor: request.actor,
                            confirmation: request.confirmation,
                            createdAt: "2026-07-26T12:00:00.000Z",
                            reason: request.reason,
                        },
                        snapshot: {} as never,
                    };
                },
            },
            telemetry,
        );
        await promotion.promoteStable({
            kind: "demo",
            version: "1.0.0",
            currentReportRevisionId: admission.id,
            actor: "secret-admin-subject",
            reason: "token=secret /var/lib/private",
            confirmation: { version: "1.0.0", reportRevisionId: admission.id },
        });

        const revision = revisedReport();
        const reevaluator = new ObservedIntegrationCompatibilityReevaluator(
            {
                reevaluate: async () => ({
                    revision,
                    history: { admission, current: revision, revisions: [revision] },
                }),
            },
            telemetry,
        );
        await reevaluator.reevaluate({
            kind: "demo",
            version: "1.0.0",
            currentReportRevisionId: admission.id,
            actor: "another-secret-actor",
            reason: "package content must stay private",
        });

        const serialized = lines.join("\n");
        expect(serialized).not.toContain("secret-admin-subject");
        expect(serialized).not.toContain("another-secret-actor");
        expect(serialized).not.toContain("token=secret");
        expect(serialized).not.toContain("/var/lib/private");
        expect(lines.map((line) => JSON.parse(line))).toEqual([
            expect.objectContaining({
                schema: "cms.repository.operation.v1",
                operation: "stable-promotion",
                operationId: "promotion-operation",
                reportRevisionId: admission.id,
                outcome: "succeeded",
                durationMs: 7,
            }),
            expect.objectContaining({
                operation: "compatibility-reevaluation",
                reportRevisionId: revision.id,
                compatibilityOutcome: "breaking",
                outcome: "succeeded",
            }),
        ]);
        expect(telemetry.snapshot()).toMatchObject({
            operations: {
                "stable-promotion": { attempted: 1, succeeded: 1 },
                "compatibility-reevaluation": { attempted: 1, succeeded: 1 },
            },
            compatibility: { reevaluations: 1, warnings: 1 },
        });
    });

    test("classifies safe 4xx codes while suppressing exception messages and logger failures", async () => {
        const entries: unknown[] = [];
        const telemetry = new RepositoryOperationalTelemetry({
            createOperationId: () => "rejected-operation",
            log: (entry) => {
                entries.push(entry);
                throw new Error("logging failed");
            },
        });
        const promoter = new ObservedIntegrationRegistryStablePromoter(
            {
                promoteStable: async () => {
                    throw Object.assign(new Error("Bearer secret at /registry/private"), {
                        status: 409,
                        code: "integration_registry_stable_promotion_conflict",
                    });
                },
            },
            telemetry,
        );

        await expect(
            promoter.promoteStable({
                kind: "demo",
                version: "1.0.0",
                currentReportRevisionId: "report-1",
                actor: "secret-admin-subject",
                confirmation: { version: "1.0.0", reportRevisionId: "report-1" },
            }),
        ).rejects.toThrow("Bearer secret");

        expect(entries).toEqual([
            expect.objectContaining({
                operationId: "rejected-operation",
                outcome: "rejected",
                errorCode: "integration_registry_stable_promotion_conflict",
            }),
        ]);
        expect(JSON.stringify(entries)).not.toContain("Bearer secret");
        expect(JSON.stringify(entries)).not.toContain("/registry/private");
        expect(telemetry.snapshot().operations["stable-promotion"]).toMatchObject({
            attempted: 1,
            inFlight: 0,
            rejected: 1,
        });
    });

    test("counts only served public bytes and rate-limit rejections", () => {
        const telemetry = new RepositoryOperationalTelemetry();
        telemetry.observePublicPackageRead({ outcome: "served", resource: "package", bytes: 4_096 });
        telemetry.observePublicPackageRead({ outcome: "served", resource: "release-notes", bytes: 120 });
        telemetry.observePublicPackageRead({ outcome: "rate-limited", budget: "download" });
        telemetry.observePublicPackageRead({ outcome: "rate-limited", budget: "metadata" });
        telemetry.observePublicRead({ resource: "integrations", method: "GET", status: 200, durationMs: 3 });
        telemetry.observePublicRead({ resource: "integration-index", method: "GET", status: 404, durationMs: 5 });
        telemetry.observePublicRead({ resource: "integration-package", method: "GET", status: 429, durationMs: 7 });
        telemetry.observePublicRead({ resource: "integration-package", method: "HEAD", status: 503, durationMs: 11 });

        expect(telemetry.snapshot().publicPackages).toEqual({
            packagesServed: 1,
            packageBytes: 4_096,
            releaseNotesServed: 1,
            releaseNotesBytes: 120,
            rateLimitRejections: 2,
            downloadRateLimitRejections: 1,
        });
        expect(telemetry.snapshot().repositoryReads).toEqual({
            total: 4,
            succeeded: 1,
            notFound: 1,
            rejected: 1,
            failed: 1,
            totalDurationMs: 26,
            maximumDurationMs: 11,
        });
    });
});

const DIGEST = "a".repeat(64);

function report(admissible: boolean): IntegrationCompatibilityAdmissionReport {
    return {
        reportType: "admission",
        id: "admission-report",
        kind: "demo",
        version: "1.0.0",
        packageDigest: DIGEST,
        evaluator: { name: "cms-repository-server", version: "1.0.0" },
        createdAt: "2026-07-26T12:00:00.000Z",
        baselines: [],
        informationalBaselines: [],
        evidence: [],
        outcome: admissible ? "not-applicable" : "breaking",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        admissible,
        noBaselineReason: "new-kind",
    };
}

function revisedReport(): IntegrationCompatibilityReportRevision {
    return {
        ...report(false),
        reportType: "revision",
        id: "revision-report",
        supersedes: "admission-report",
        provenance: { actor: "never-log", reason: "never-log" },
    };
}
