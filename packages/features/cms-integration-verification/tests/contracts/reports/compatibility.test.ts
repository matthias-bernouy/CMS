import { describe, expect, test } from "bun:test";
import {
    assertReportRevisionFollows,
    createCompatibilityFinding,
    parseCompatibilityReportV2,
} from "../../../src/exports/index";
import { CREATED_AT, DIGEST_A, DIGEST_B, provenance } from "../fixtures";

async function report() {
    const finding = await createCompatibilityFinding({
        surface: "schema",
        path: "public.orders.status",
        code: "column-added",
        baselineDigest: DIGEST_B,
        candidateDigest: DIGEST_A,
        classification: "additive",
        message: "Column status was added",
    });
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
        outcome: "compatible",
        requiredReleaseLevel: "minor",
        releaseLevel: "minor",
        contractAdmissible: true,
        provenance: provenance(),
    } as const;
}

describe("compatibility report v2", () => {
    test("separates static contract admission from the global release decision", async () => {
        const parsed = await parseCompatibilityReportV2(await report());

        expect(parsed.contractAdmissible).toBeTrue();
        expect(Object.hasOwn(parsed, "admissible")).toBeFalse();
        expect(parsed.findings).toHaveLength(1);
    });

    test("enforces exact baseline and candidate finding references", async () => {
        const value = await report();
        await expect(
            parseCompatibilityReportV2({
                ...value,
                findings: [{ ...value.findings[0]!, baselineDigest: "c".repeat(64) }],
            }),
        ).rejects.toThrow(/findingId does not match/);
    });

    test("models a first kind as an explicit not-applicable root", async () => {
        const value = await report();
        const parsed = await parseCompatibilityReportV2({
            ...value,
            version: "1.0.0",
            baselines: [],
            findings: [],
            outcome: "not-applicable",
            requiredReleaseLevel: "none",
            releaseLevel: "initial",
            noBaselineReason: "new-kind",
        });

        expect(parsed.noBaselineReason).toBe("new-kind");
        expect(parsed.outcome).toBe("not-applicable");
    });

    test("preserves origin and requires an exact append-only revision link", async () => {
        const root = await parseCompatibilityReportV2(await report());
        const revision = await parseCompatibilityReportV2({
            ...(await report()),
            reportId: "compatibility-2",
            revisionType: "revision",
            supersedes: root.reportId,
        });

        expect(() => assertReportRevisionFollows(root, revision)).not.toThrow();
        expect(() => assertReportRevisionFollows(root, { ...revision, origin: "legacy-backfill" })).toThrow(
            /must remain stable/,
        );
    });
});
