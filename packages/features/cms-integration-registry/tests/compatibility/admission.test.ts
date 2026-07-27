import { describe, expect, test } from "bun:test";
import { IntegrationCompatibilityEvaluator } from "@bernouy/cms-integration-registry";
import { BASELINE_DIGEST, CANDIDATE_DIGEST, evaluator, packageState } from "./fixtures";

describe("integration compatibility evaluation", () => {
    test("records an explicit no-baseline assessment for the first version of a kind", () => {
        const decision = evaluator().evaluate({
            candidate: packageState("1.0.0"),
            noBaselineReason: "new-kind",
        });

        expect(decision).toMatchObject({
            packageDigest: BASELINE_DIGEST,
            baselines: [],
            informationalBaselines: [],
            evidence: [],
            outcome: "not-applicable",
            noBaselineReason: "new-kind",
            requiredReleaseLevel: "none",
            releaseLevel: "initial",
            contractAdmissible: true,
        });
    });

    test("allows a breaking new major and keeps the prior line informational", () => {
        const decision = evaluator().evaluate({
            candidate: packageState("2.0.0", { inputs: [] }),
            noBaselineReason: "new-major",
            informationalBaseline: packageState("1.0.0", {
                inputs: [{ name: "account", label: "Account", type: "text", required: true }],
            }),
        });

        expect(decision.contractAdmissible).toBeTrue();
        expect(decision).toMatchObject({
            outcome: "not-applicable",
            noBaselineReason: "new-major",
            requiredReleaseLevel: "major",
            releaseLevel: "major",
            baselines: [],
            informationalBaselines: [{ version: "1.0.0", packageDigest: BASELINE_DIGEST }],
        });
        expect(decision.evidence).toContainEqual(
            expect.objectContaining({ classification: "breaking", code: "input-removed" }),
        );
    });

    test.each([
        ["1.0.1", false],
        ["1.1.0", true],
    ])("requires a minor release for additive declarations in %s", (version, accepted) => {
        const decision = evaluator().evaluate({
            baseline: packageState("1.0.0"),
            candidate: packageState(version, {
                inputs: [{ name: "note", label: "Note", type: "text" }],
            }),
        });

        expect(decision.contractAdmissible).toBe(accepted);
        expect(decision.outcome).toBe("compatible");
        expect(decision.requiredReleaseLevel).toBe("minor");
        expect(decision.evidence).toContainEqual(
            expect.objectContaining({ classification: "additive", code: "optional-input-added" }),
        );
        if (!accepted) {
            expect(decision.contractAdmissible).toBeFalse();
        }
    });

    test.each(["1.0.1", "1.1.0"])("returns an inadmissible assessment for breaking %s", (version) => {
        const decision = evaluator().evaluate({
            baseline: packageState("1.0.0"),
            candidate: packageState(version, {
                inputs: [{ name: "account", label: "Account", type: "text", required: true }],
            }),
        });

        expect(decision).toMatchObject({
            packageDigest: CANDIDATE_DIGEST,
            outcome: "breaking",
            requiredReleaseLevel: "major",
            contractAdmissible: false,
        });
    });

    test("builds one canonical V2 root from the pure assessment", async () => {
        const report = await evaluator().buildRoot(
            { candidate: packageState("1.0.0"), noBaselineReason: "new-kind" },
            "admission",
            { actor: "registry", reason: "Initial evaluation" },
        );

        expect(report.report).toMatchObject({
            schema: "cms.integration.compatibility-report.v2",
            reportId: "report-1",
            revisionType: "root",
            contractAdmissible: true,
        });
        expect(report.digest).toMatch(/^[a-f0-9]{64}$/u);
        expect(IntegrationCompatibilityEvaluator).toBeFunction();
    });
});
