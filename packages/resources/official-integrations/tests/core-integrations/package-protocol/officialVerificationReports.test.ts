import { describe, expect, test } from "bun:test";
import {
    buildOfficialIntegrationPackages,
    buildOfficialVerificationBackfillReports,
} from "@bernouy/cms-official-integrations/publication";

describe("official verification backfill reports", () => {
    test("creates honest immutable roots and exact composite decisions for all official versions", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const reportSets = await buildOfficialVerificationBackfillReports();

        expect(reportSets).toHaveLength(14);
        for (const [index, reportSet] of reportSets.entries()) {
            const integrationPackage = packages[index];
            expect(integrationPackage).toBeDefined();
            const target = {
                kind: integrationPackage!.kind,
                version: integrationPackage!.version,
                packageDigest: integrationPackage!.digest,
            };
            expect(reportSet.compatibility).toMatchObject({
                ...target,
                revisionType: "root",
                origin: "legacy-backfill",
                releaseLevel: "initial",
                contractAdmissible: true,
            });
            expect(reportSet.verification).toMatchObject({
                ...target,
                revisionType: "root",
                origin: "legacy-backfill",
                outcome: "passed",
            });
            expect(reportSet.decision).toMatchObject({
                ...target,
                revisionType: "root",
                admissible: true,
                reasons: [],
            });
            expect(reportSet.decision.verificationReport).toBeDefined();
            expect(reportSet.statefulChanges.target).toEqual(target);
            expect(reportSet.statefulChanges.requiredMigrations).toEqual([]);
        }
    });

    test("only claims SQL install-and-reapply where pinned calibration evidence exists", async () => {
        const reportSets = await buildOfficialVerificationBackfillReports();
        const sqlReports = reportSets.filter(({ verification }) => verification.baselines.length > 0);
        const packageOnlyReports = reportSets.filter(({ verification }) => verification.baselines.length === 0);

        expect(sqlReports).toHaveLength(9);
        expect(packageOnlyReports).toHaveLength(5);
        for (const { verification } of sqlReports) {
            expect(verification.results.map(({ suiteId }) => suiteId)).toEqual([
                "package-contract-validation",
                "sql-install-and-reapply",
            ]);
            expect(verification.provenance.reason).toContain("fresh/fresh");
        }
        for (const { verification } of packageOnlyReports) {
            expect(verification.results.map(({ suiteId }) => suiteId)).toEqual(["package-contract-validation"]);
            expect(verification.provenance.reason).toContain("only");
        }
    });
});
