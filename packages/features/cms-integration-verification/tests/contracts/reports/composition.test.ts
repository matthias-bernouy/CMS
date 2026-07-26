import { describe, expect, test } from "bun:test";
import {
    composeReleaseAdmissionDecision,
    createCompatibilityFinding,
    deriveCompatibilityReportAssessment,
    type CompatibilityFindingClassification,
    type CompatibilityReportV2,
} from "../../../src/exports/index";
import { CREATED_AT, DIGEST_A, DIGEST_B, migrationReport, provenance, verificationReport } from "../fixtures";

describe("release admission decision composition", () => {
    test("requires static, executable, and selected migration evidence", async () => {
        const compatibility = await compatibilityReport();
        const requiredMigrations = [migrationRequirement()] as const;
        const admitted = await composeReleaseAdmissionDecision({
            ...decisionInput(compatibility),
            verification: verificationReport(),
            migrations: [migrationReport()],
            requiredMigrations,
        });
        expect(admitted).toMatchObject({
            admissible: true,
            compatibilityReportRevisionId: "compatibility-1",
            verificationReportRevisionId: "verification-1",
            migrationReportRevisionIds: ["migration-1"],
            reasons: [],
        });

        const missing = await composeReleaseAdmissionDecision({
            ...decisionInput(compatibility),
            migrations: [],
            requiredMigrations,
        });
        expect(missing.admissible).toBeFalse();
        expect(missing.reasons).toEqual([
            "migration-missing:example@1.1.0:primary:example-supabase-v1",
            "verification-missing",
        ]);
    });

    test("keeps infrastructure failures distinct from integration failures", async () => {
        const compatibility = await compatibilityReport();
        const infrastructure = verificationReport();
        infrastructure.results[0] = { ...infrastructure.results[0]!, outcome: "infrastructure-failure" };
        infrastructure.outcome = "infrastructure-failure";
        const decision = await composeReleaseAdmissionDecision({
            ...decisionInput(compatibility),
            verification: infrastructure,
            migrations: [],
            requiredMigrations: [],
        });
        expect(decision).toMatchObject({
            admissible: false,
            reasons: ["verification-infrastructure-failure"],
        });
    });

    test("rejects report identity substitution and duplicate migration claims", async () => {
        const compatibility = await compatibilityReport();
        await expect(
            composeReleaseAdmissionDecision({
                ...decisionInput(compatibility),
                verification: { ...verificationReport(), packageDigest: "c".repeat(64) },
                migrations: [],
                requiredMigrations: [],
            }),
        ).rejects.toThrow(/does not target/);
        await expect(
            composeReleaseAdmissionDecision({
                ...decisionInput(compatibility),
                verification: verificationReport(),
                migrations: [migrationReport(), { ...migrationReport(), reportId: "migration-2" }],
                requiredMigrations: [],
            }),
        ).rejects.toThrow(/duplicate source and connector/);
    });

    test("allows a major without an advertised in-place path while keeping verification mandatory", async () => {
        const compatibility = await compatibilityReport({ releaseLevel: "major", classification: "breaking" });
        const decision = await composeReleaseAdmissionDecision({
            ...decisionInput(compatibility),
            verification: verificationReport(),
            migrations: [],
            requiredMigrations: [],
        });
        expect(decision.admissible).toBeTrue();
        expect(decision.migrationReportRevisionIds).toEqual([]);
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

function decisionInput(compatibility: CompatibilityReportV2) {
    return {
        decisionId: "decision-composed-1",
        revisionType: "root" as const,
        compatibility,
        policy: { name: "default-admission", version: "1.2.0" },
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
