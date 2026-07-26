import { describe, expect, test } from "bun:test";
import {
    createCompatibilityFinding,
    deriveCompatibilityReportAssessment,
    parseCompatibilityReportV2,
    type CompatibilityFindingClassification,
    type CompatibilityReleaseLevel,
} from "../../../src/exports/index";
import { CREATED_AT, DIGEST_A, DIGEST_B, provenance } from "../fixtures";

describe("compatibility report assessment", () => {
    test.each([
        ["patch additive", "additive", "patch", "compatible", "minor", false],
        ["minor breaking", "breaking", "minor", "breaking", "major", false],
        ["major breaking", "breaking", "major", "breaking", "major", true],
        ["major invalid", "invalid", "major", "invalid", "none", false],
        ["major unknown", "unknown", "major", "unknown", "major", true],
    ] as const)(
        "derives and enforces %s admission",
        async (_label, classification, releaseLevel, outcome, requiredReleaseLevel, contractAdmissible) => {
            const parsed = await parseCompatibilityReportV2(await report(classification, releaseLevel));

            expect(parsed).toMatchObject({ outcome, requiredReleaseLevel, releaseLevel, contractAdmissible });
        },
    );

    test.each([
        ["outcome", "breaking"],
        ["requiredReleaseLevel", "patch"],
        ["contractAdmissible", false],
    ] as const)("rejects a caller-tampered %s", async (field, value) => {
        const valid = await report("additive", "minor");

        await expect(parseCompatibilityReportV2({ ...valid, [field]: value })).rejects.toMatchObject({
            code: "invalid_contract",
            field: `compatibilityReport.${field}`,
        });
    });

    test("rejects unauditable proof overrides from the v2 report envelope", async () => {
        const valid = await report("unknown", "major");

        await expect(
            parseCompatibilityReportV2({
                ...valid,
                findingResolutions: [],
            }),
        ).rejects.toThrow(/findingResolutions is not an allowed field/);
    });

    test("keeps an informational new-major comparison out of release enforcement", async () => {
        const regular = await report("breaking", "major");
        const parsed = await parseCompatibilityReportV2({
            ...regular,
            baselines: [],
            informationalBaselines: regular.baselines,
            noBaselineReason: "new-major",
            outcome: "not-applicable",
        });

        expect(parsed).toMatchObject({
            outcome: "not-applicable",
            requiredReleaseLevel: "major",
            contractAdmissible: true,
        });
    });

    test("represents a candidate-only invalid finding for an initial kind without inventing a baseline", async () => {
        const invalid = await report("invalid", "major");
        const finding = await createCompatibilityFinding({
            surface: "schema",
            path: "public.orders",
            code: "candidate-schema-invalid",
            baselineDigest: DIGEST_A,
            candidateDigest: DIGEST_A,
            classification: "invalid",
            message: "The initial candidate schema contradicts its declaration",
        });
        const initial = {
            ...invalid,
            version: "1.0.0",
            baselines: [],
            findings: [{ ...finding!, baselineDigest: DIGEST_A }],
            releaseLevel: "initial",
            noBaselineReason: "new-kind",
            outcome: "invalid",
            requiredReleaseLevel: "none",
            contractAdmissible: false,
        } as const;

        await expect(parseCompatibilityReportV2(initial)).resolves.toMatchObject({
            outcome: "invalid",
            contractAdmissible: false,
        });
        await expect(
            createCompatibilityFinding({
                surface: finding.surface,
                path: finding.path,
                code: finding.code,
                baselineDigest: finding.baselineDigest,
                candidateDigest: finding.candidateDigest,
                classification: "additive",
                message: finding.message,
            }).then((additive) =>
                parseCompatibilityReportV2({
                    ...initial,
                    findings: [additive],
                    outcome: "not-applicable",
                    requiredReleaseLevel: "none",
                    contractAdmissible: true,
                }),
            ),
        ).rejects.toMatchObject({ code: "invalid_reference" });
    });

    test("rejects ambiguous enforcing and informational baseline shapes", async () => {
        const regular = await report("compatible", "patch");

        await expect(
            parseCompatibilityReportV2({ ...regular, informationalBaselines: regular.baselines }),
        ).rejects.toThrow(/cannot also carry an informational baseline/);
        await expect(
            parseCompatibilityReportV2({
                ...regular,
                baselines: [],
                informationalBaselines: [regular.baselines[0], regular.baselines[0]],
                releaseLevel: "major",
                noBaselineReason: "new-major",
                outcome: "not-applicable",
                requiredReleaseLevel: "major",
                contractAdmissible: true,
            }),
        ).rejects.toThrow();
    });
});

async function report(
    classification: CompatibilityFindingClassification,
    releaseLevel: Exclude<CompatibilityReleaseLevel, "initial">,
) {
    const finding = await createCompatibilityFinding({
        surface: "schema",
        path: "public.orders.status",
        code: "schema-change",
        baselineDigest: DIGEST_B,
        candidateDigest: DIGEST_A,
        classification,
        message: "The orders schema changed",
    });
    const assessment = deriveCompatibilityReportAssessment({ effectiveFindings: [finding], releaseLevel });
    return {
        schema: "cms.integration.compatibility-report.v2",
        reportId: "compatibility-assessment-1",
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
    } as const;
}
