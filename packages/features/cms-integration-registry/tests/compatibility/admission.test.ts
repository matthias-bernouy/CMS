import { describe, expect, test } from "bun:test";
import {
    assertIntegrationCompatibilityAdmission,
    IntegrationCompatibilityAdmissionError,
} from "@bernouy/cms-integration-registry";
import { BASELINE_DIGEST, CANDIDATE_DIGEST, evaluator, packageState } from "./fixtures";

describe("integration compatibility admission", () => {
    test("persists an explicit no-baseline report for the first version of a kind", () => {
        const decision = evaluator().evaluateAdmission({
            candidate: packageState("1.0.0"),
            noBaselineReason: "new-kind",
        });

        expect(decision).toMatchObject({
            accepted: true,
            report: {
                id: "report-1",
                reportType: "admission",
                evaluator: { name: "cms-compatibility", version: "1.0.0" },
                createdAt: "2026-07-26T10:00:00.000Z",
                packageDigest: BASELINE_DIGEST,
                baselines: [],
                informationalBaselines: [],
                evidence: [],
                outcome: "not-applicable",
                noBaselineReason: "new-kind",
                requiredReleaseLevel: "none",
                releaseLevel: "initial",
                admissible: true,
            },
        });
    });

    test("allows a breaking new major and keeps the prior line informational", () => {
        const decision = evaluator().evaluateAdmission({
            candidate: packageState("2.0.0", { inputs: [] }),
            noBaselineReason: "new-major",
            informationalBaseline: packageState("1.0.0", {
                inputs: [{ name: "account", label: "Account", type: "text", required: true }],
            }),
        });

        expect(decision.accepted).toBeTrue();
        expect(decision.report).toMatchObject({
            outcome: "not-applicable",
            noBaselineReason: "new-major",
            requiredReleaseLevel: "major",
            releaseLevel: "major",
            baselines: [],
            informationalBaselines: [{ version: "1.0.0", packageDigest: BASELINE_DIGEST }],
        });
        expect(decision.report.evidence).toContainEqual(
            expect.objectContaining({ classification: "breaking", code: "input-removed" }),
        );
    });

    test.each([
        ["1.0.1", false],
        ["1.1.0", true],
    ])("requires a minor release for additive declarations in %s", (version, accepted) => {
        const decision = evaluator().evaluateAdmission({
            baseline: packageState("1.0.0"),
            candidate: packageState(version, {
                inputs: [{ name: "note", label: "Note", type: "text" }],
            }),
        });

        expect(decision.accepted).toBe(accepted);
        expect(decision.report.outcome).toBe("compatible");
        expect(decision.report.requiredReleaseLevel).toBe("minor");
        expect(decision.report.evidence).toContainEqual(
            expect.objectContaining({ classification: "additive", code: "optional-input-added" }),
        );
        if (!accepted) {
            expect(decision).toMatchObject({ status: 422 });
            expect(() => assertIntegrationCompatibilityAdmission(decision)).toThrow(/requires a minor release/);
        }
    });

    test.each(["1.0.1", "1.1.0"])("returns a structured 422 decision for breaking %s", (version) => {
        const decision = evaluator().evaluateAdmission({
            baseline: packageState("1.0.0"),
            candidate: packageState(version, {
                inputs: [{ name: "account", label: "Account", type: "text", required: true }],
            }),
        });

        expect(decision).toMatchObject({
            accepted: false,
            status: 422,
            code: "integration_compatibility_rejected",
            report: {
                packageDigest: CANDIDATE_DIGEST,
                outcome: "breaking",
                requiredReleaseLevel: "major",
                admissible: false,
            },
        });
        expect(() => assertIntegrationCompatibilityAdmission(decision)).toThrow(IntegrationCompatibilityAdmissionError);
        try {
            assertIntegrationCompatibilityAdmission(decision);
        } catch (error) {
            expect(error).toMatchObject({ status: 422, code: "integration_compatibility_rejected" });
        }
    });
});
