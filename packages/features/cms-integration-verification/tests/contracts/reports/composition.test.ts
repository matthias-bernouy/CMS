import { describe, expect, test } from "bun:test";
import {
    assertReleaseAdmissionDecisionMatchesReports,
    composeReleaseAdmissionDecision,
    createCompatibilityFinding,
    deriveCompatibilityReportAssessment,
    identifyCompatibilityReportV2,
    identifyStatefulChangeSelection,
    type CompatibilityFindingClassification,
    type CompatibilityReportV2,
    parseMigrationReport,
} from "../../../src/exports/index";
import { CREATED_AT, DIGEST_A, DIGEST_B, DIGEST_C, migrationReport, provenance, verificationReport } from "../fixtures";

describe("release admission decision composition", () => {
    test("requires static, executable, and selected migration evidence", async () => {
        const compatibility = await compatibilityReport();
        const requiredMigrations = [migrationRequirement()] as const;
        const input = await decisionInput(compatibility, requiredMigrations);
        const admitted = await composeReleaseAdmissionDecision({
            ...input,
            verification: verificationReport(),
            migrations: [{ ...migrationReport(), statefulChangeSelectionDigest: input.statefulChanges.digest }],
        });
        expect(admitted).toMatchObject({
            admissible: true,
            compatibilityReport: { revisionId: "compatibility-1" },
            verificationReport: { revisionId: "verification-1" },
            migrationReports: [{ revisionId: "migration-1" }],
            reasons: [],
        });
        await expect(
            assertReleaseAdmissionDecisionMatchesReports(admitted, {
                compatibility,
                verification: verificationReport(),
                migrations: [{ ...migrationReport(), statefulChangeSelectionDigest: input.statefulChanges.digest }],
            }),
        ).resolves.toEqual(admitted);

        const missing = await composeReleaseAdmissionDecision({
            ...input,
            migrations: [],
        });
        expect(missing.admissible).toBeFalse();
        expect(missing.reasons).toEqual([
            "migration-missing:example@1.1.0:primary:example-supabase-v1",
            "verification-missing",
        ]);
    });

    test("keeps infrastructure failures distinct from integration failures", async () => {
        const compatibility = await compatibilityReport();
        const input = await decisionInput(compatibility, []);
        const infrastructure = verificationReport();
        infrastructure.results[0] = {
            ...infrastructure.results[0]!,
            outcome: "infrastructure-failure",
            diagnostics: [{ code: "runner-unavailable", message: "Runner exited", redacted: true }],
        };
        infrastructure.outcome = "infrastructure-failure";
        const decision = await composeReleaseAdmissionDecision({
            ...input,
            verification: infrastructure,
            migrations: [],
        });
        expect(decision).toMatchObject({
            admissible: false,
            reasons: ["verification-infrastructure-failure"],
        });
    });

    test("uses the persisted migration policy evaluation as part of the composite admission truth", async () => {
        const compatibility = await compatibilityReport();
        const input = await decisionInput(compatibility, [migrationRequirement()]);
        const report = parseMigrationReport({
            ...migrationReport(),
            statefulChangeSelectionDigest: input.statefulChanges.digest,
            policyEvaluation: {
                releaseLevel: "minor",
                applicable: true,
                satisfied: false,
                checks: [
                    {
                        check: "report-outcome",
                        applicable: true,
                        satisfied: true,
                        observed: "passed",
                    },
                    {
                        check: "environment",
                        applicable: true,
                        satisfied: false,
                        observed: DIGEST_B,
                        reason: "migration-environment-not-approved",
                    },
                ],
                reasons: ["migration-environment-not-approved"],
            },
        });
        const decision = await composeReleaseAdmissionDecision({
            ...input,
            verification: verificationReport(),
            migrations: [report],
        });

        expect(decision).toMatchObject({
            admissible: false,
            reasons: [
                "migration-policy-failed:example@1.1.0:primary:example-supabase-v1:migration-environment-not-approved",
            ],
        });
        await expect(
            assertReleaseAdmissionDecisionMatchesReports(decision, {
                compatibility,
                verification: verificationReport(),
                migrations: [report],
            }),
        ).resolves.toEqual(decision);
    });

    test("rejects report identity substitution and duplicate migration claims", async () => {
        const compatibility = await compatibilityReport();
        const input = await decisionInput(compatibility, []);
        await expect(
            composeReleaseAdmissionDecision({
                ...input,
                verification: { ...verificationReport(), packageDigest: "c".repeat(64) },
                migrations: [],
            }),
        ).rejects.toThrow(/does not target/);
        const migrationInput = await decisionInput(compatibility, [migrationRequirement()]);
        const migration = {
            ...migrationReport(),
            statefulChangeSelectionDigest: migrationInput.statefulChanges.digest,
        };
        await expect(
            composeReleaseAdmissionDecision({
                ...migrationInput,
                verification: verificationReport(),
                migrations: [migration, { ...migration, reportId: "migration-2" }],
            }),
        ).rejects.toThrow(/duplicate source and connector/);
    });

    test("allows a major without an advertised in-place path while keeping verification mandatory", async () => {
        const compatibility = await compatibilityReport({ releaseLevel: "major", classification: "breaking" });
        const input = await decisionInput(compatibility, []);
        const decision = await composeReleaseAdmissionDecision({
            ...input,
            verification: verificationReport(),
            migrations: [],
        });
        expect(decision.admissible).toBeTrue();
        expect(decision.migrationReports).toEqual([]);
    });

    test("fails closed when a cited current report is substituted", async () => {
        const compatibility = await compatibilityReport();
        const input = await decisionInput(compatibility, []);
        const verification = verificationReport();
        const decision = await composeReleaseAdmissionDecision({ ...input, verification, migrations: [] });
        const revisedVerification = {
            ...verification,
            reportId: "verification-2",
            revisionType: "revision" as const,
            supersedes: verification.reportId,
        };

        await expect(
            assertReleaseAdmissionDecisionMatchesReports(decision, {
                compatibility,
                verification: revisedVerification,
                migrations: [],
            }),
        ).rejects.toThrow(/stale|exact report revisions/);
    });

    test("rejects policy identity substitution even when the snapshot digest is unchanged", async () => {
        const compatibility = await compatibilityReport();
        const input = await decisionInput(compatibility, []);
        await expect(
            composeReleaseAdmissionDecision({
                ...input,
                verification: {
                    ...verificationReport(),
                    policy: { name: "substituted-policy", version: "1.2.0" },
                },
                migrations: [],
            }),
        ).rejects.toThrow(/policy identity and snapshot/);

        const decision = await composeReleaseAdmissionDecision({
            ...input,
            verification: verificationReport(),
            migrations: [],
        });
        await expect(
            assertReleaseAdmissionDecisionMatchesReports(
                { ...decision, policy: { name: "substituted-policy", version: "1.2.0" } },
                { compatibility, verification: verificationReport(), migrations: [] },
            ),
        ).rejects.toThrow(/statefulChanges|policy/);
    });
});

async function compatibilityReport(
    overrides: Readonly<{
        releaseLevel?: CompatibilityReportV2["releaseLevel"];
        classification?: CompatibilityFindingClassification;
    }> = {},
): Promise<CompatibilityReportV2> {
    const releaseLevel = overrides.releaseLevel ?? "minor";
    const finding = await createCompatibilityFinding({
        surface: "schema",
        path: "public.orders.status",
        code: "column-added",
        baselineDigest: DIGEST_B,
        candidateDigest: DIGEST_A,
        classification: overrides.classification ?? "additive",
        message: "Column status was added",
    });
    const assessment = deriveCompatibilityReportAssessment({ effectiveFindings: [finding], releaseLevel });
    return {
        schema: "cms.integration.compatibility-report.v2",
        reportId: "compatibility-1",
        revisionType: "root",
        origin: "admission",
        createdAt: CREATED_AT,
        kind: "example",
        version: "1.2.0",
        packageDigest: DIGEST_A,
        evaluator: { name: "static-compatibility", version: "2.0.0" },
        baselines: [{ kind: "example", version: "1.1.0", packageDigest: DIGEST_B }],
        informationalBaselines: [],
        findings: [finding],
        ...assessment,
        releaseLevel,
        provenance: provenance(),
    };
}

async function decisionInput(
    compatibility: CompatibilityReportV2,
    requiredMigrations: readonly ReturnType<typeof migrationRequirement>[],
) {
    const compatibilityIdentity = await identifyCompatibilityReportV2(compatibility);
    const statefulChanges = await identifyStatefulChangeSelection({
        schema: "cms.integration.stateful-change-selection.v1",
        selector: { name: "default-admission", version: "1.2.0" },
        policySnapshotDigest: DIGEST_C,
        target: {
            kind: compatibility.kind,
            version: compatibility.version,
            packageDigest: compatibility.packageDigest,
        },
        compatibilityReport: {
            revisionId: compatibility.reportId,
            reportDigest: compatibilityIdentity.digest,
        },
        requiredMigrations,
    });
    return {
        decisionId: "decision-composed-1",
        revisionType: "root" as const,
        compatibility,
        statefulChanges,
        policy: { name: "default-admission", version: "1.2.0" },
        policySnapshotDigest: DIGEST_C,
        createdAt: CREATED_AT,
        provenance: provenance(),
    };
}

function migrationRequirement() {
    return {
        source: { kind: "example", version: "1.1.0", packageDigest: DIGEST_B },
        connectorKey: "primary",
        lineageId: "example-supabase-v1",
    } as const;
}
