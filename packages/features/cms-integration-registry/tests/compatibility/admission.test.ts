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

    test.each([
        ["new-kind", "1.0.0", "consistent", true],
        ["new-kind", "1.0.0", "contradiction", false],
        ["new-major", "2.0.0", "consistent", true],
        ["new-major", "2.0.0", "contradiction", false],
    ] as const)(
        "builds a %s V2 root with trusted %s schema evidence",
        async (noBaselineReason, version, verdict, contractAdmissible) => {
            const candidatePackage = packageState(version);
            const candidate = {
                ...candidatePackage,
                schemaDeclarationEvidence: [
                    {
                        evidenceId: `schema-${verdict}`,
                        packageDigest: candidatePackage.packageDigest,
                        connector: { provider: "supabase", root: "connectors/supabase" },
                        producer: { name: "schema-introspection", version: "1.0.0" },
                        createdAt: "2026-07-26T10:00:00.000Z",
                        verdict,
                    },
                ],
            };
            const report = await evaluator().buildRoot({ candidate, noBaselineReason }, "admission", {
                actor: "registry",
                reason: "Initial evaluation",
            });

            expect(report.report).toMatchObject({ noBaselineReason, contractAdmissible });
            expect(report.report.findings).toContainEqual(
                expect.objectContaining({ classification: verdict === "consistent" ? "compatible" : "invalid" }),
            );
        },
    );
});
