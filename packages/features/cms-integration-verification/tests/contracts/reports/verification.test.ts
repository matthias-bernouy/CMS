import { describe, expect, test } from "bun:test";
import { parseVerificationReport } from "../../../src/exports/index";
import { verificationReport } from "../fixtures";

describe("verification report contract", () => {
    test("records exact runner, environment, contract, and retry identities", () => {
        const parsed = parseVerificationReport(verificationReport());

        expect(parsed.outcome).toBe("passed");
        expect(parsed.runner.imageDigest).toStartWith("sha256:");
        expect(parsed.policySnapshotDigest).toHaveLength(64);
        expect(parsed.admissionInputDigest).toHaveLength(64);
        expect(parsed.verificationJobResultDigest).toHaveLength(64);
        expect(parsed.baselines[0]).toMatchObject({
            connectorKey: "primary",
            revisionId: "baseline-1",
            observedSchemaDigest: expect.any(String),
        });
        expect(parsed.results[0]?.attempts).toBe(2);
        expect(parsed.results[0]?.evidenceDigests).toHaveLength(1);
        expect(parsed.activeContracts[0]?.digest).toHaveLength(64);
    });

    test("preserves distinct minimum and stable dependency points sharing one package digest", () => {
        const base = verificationReport();
        const parsed = parseVerificationReport({
            ...base,
            dependencies: [
                { selection: "minimum", kind: "dependency", version: "1.0.0", packageDigest: base.packageDigest },
                { selection: "stable", kind: "dependency", version: "1.0.0", packageDigest: base.packageDigest },
            ],
        });

        expect(parsed.dependencies.map((dependency) => dependency.selection)).toEqual(["minimum", "stable"]);
    });

    test("allows an honest legacy-backfill root without fabricating a predecessor", () => {
        const parsed = parseVerificationReport({
            ...verificationReport(),
            reportId: "verification-backfill-1",
            origin: "legacy-backfill",
        });

        expect(parsed.revisionType).toBe("root");
        expect(parsed.origin).toBe("legacy-backfill");
        expect(parsed.supersedes).toBeUndefined();
    });

    test("requires revisions to identify their exact predecessor", () => {
        expect(() =>
            parseVerificationReport({
                ...verificationReport(),
                reportId: "verification-2",
                revisionType: "revision",
            }),
        ).toThrow(/must identify the report it supersedes/);
        expect(
            parseVerificationReport({
                ...verificationReport(),
                reportId: "verification-2",
                revisionType: "revision",
                supersedes: "verification-1",
            }).supersedes,
        ).toBe("verification-1");
    });

    test("distinguishes product failure from infrastructure failure", () => {
        const base = verificationReport();
        const failedResult = {
            ...base.results[0]!,
            outcome: "failed",
            diagnostics: [{ code: "assertion-failed", message: "Expected idempotence", redacted: true }],
        };
        expect(parseVerificationReport({ ...base, results: [failedResult], outcome: "failed" }).outcome).toBe("failed");
        expect(() => parseVerificationReport({ ...base, results: [failedResult], outcome: "passed" })).toThrow(
            /must be failed/,
        );
        const infrastructure = { ...failedResult, outcome: "infrastructure-failure" };
        expect(
            parseVerificationReport({
                ...base,
                results: [infrastructure],
                outcome: "infrastructure-failure",
            }).outcome,
        ).toBe("infrastructure-failure");
    });

    test("requires bounded redacted diagnostics and inherited contract execution", () => {
        const base = verificationReport();
        expect(() =>
            parseVerificationReport({
                ...base,
                results: [
                    {
                        ...base.results[0]!,
                        outcome: "failed",
                        diagnostics: [{ code: "failure", message: "secret", redacted: false }],
                    },
                ],
                outcome: "failed",
            }),
        ).toThrow(/redacted.*must be true/);
        expect(() =>
            parseVerificationReport({
                ...base,
                results: [{ ...base.results[0]!, suiteId: "different" }],
            }),
        ).toThrow(/has no required execution result/);
    });

    test("refuses reports that omit exact admission or worker evidence identities", () => {
        const { admissionInputDigest: _, ...withoutAdmission } = verificationReport();
        expect(() => parseVerificationReport(withoutAdmission)).toThrow(/admissionInputDigest/);
        expect(() =>
            parseVerificationReport({
                ...verificationReport(),
                results: [{ ...verificationReport().results[0]!, evidenceDigests: [] }],
            }),
        ).toThrow(/must identify evidence for passed/);
    });
});
