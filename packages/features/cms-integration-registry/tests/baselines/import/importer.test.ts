import { afterEach, describe, expect, test } from "bun:test";
import { ReviewedSchemaBaselineImportError } from "@bernouy/cms-integration-registry";
import { FsReviewedSchemaBaselineImporter } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures } from "../../publication/fixtures";
import { reviewedBaseline } from "../fixtures";
import { baselineImportFixture, importRequest } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("reviewed schema baseline maintenance import", () => {
    test("imports an approved digest-bound baseline and makes exact retries idempotent", async () => {
        const fixture = await baselineImportFixture();

        const imported = await fixture.importer.importBaseline(fixture.request);
        const repeated = await new FsReviewedSchemaBaselineImporter({
            ...fixture.config,
            createOperationId: () => "baseline-import-2",
        }).importBaseline(fixture.request);

        expect(imported).toMatchObject({
            operationId: "baseline-import-1",
            outcome: "imported",
            kind: "demo",
            version: "1.0.0",
            packageDigest: fixture.integrationPackage.digest,
            baselineDigest: fixture.request.baselineDigest,
            currentRevisionId: fixture.baseline.reportId,
        });
        expect(repeated).toMatchObject({ operationId: "baseline-import-2", outcome: "unchanged" });
        expect(await fixture.reviewedSchemaBaselines.listAll()).toHaveLength(1);
    });

    test("rejects stale current revision and digest preconditions", async () => {
        const fixture = await baselineImportFixture();
        await fixture.importer.importBaseline(fixture.request);
        const competing = await reviewedBaseline("competing-root", {
            kind: "demo",
            packageDigest: fixture.integrationPackage.digest,
            reason: "Different reviewed evidence",
        });

        await expect(fixture.importer.importBaseline(await importRequest(competing))).rejects.toMatchObject({
            status: 409,
            code: "reviewed_schema_baseline_import_conflict",
        });
        await expect(
            fixture.importer.importBaseline(
                await importRequest(competing, {
                    revisionId: fixture.baseline.reportId,
                    baselineDigest: "f".repeat(64),
                }),
            ),
        ).rejects.toBeInstanceOf(ReviewedSchemaBaselineImportError);
    });

    test("appends reviewed revisions only against the exact current revision and digest", async () => {
        const fixture = await baselineImportFixture();
        const root = await fixture.importer.importBaseline(fixture.request);
        const revision = await reviewedBaseline("baseline-demo-revision", {
            kind: "demo",
            packageDigest: fixture.integrationPackage.digest,
            supersedes: fixture.baseline.reportId,
            reason: "Re-observed with the same approved policy",
        });
        const request = await importRequest(revision, {
            revisionId: fixture.baseline.reportId,
            baselineDigest: root.baselineDigest,
        });

        const appended = await new FsReviewedSchemaBaselineImporter({
            ...fixture.config,
            createOperationId: () => "baseline-import-revision",
        }).importBaseline(request);
        const repeated = await fixture.importer.importBaseline(request);

        expect(appended).toMatchObject({ outcome: "imported", currentRevisionId: revision.reportId });
        expect(repeated).toMatchObject({ outcome: "unchanged", currentRevisionId: revision.reportId });
        expect((await fixture.reviewedSchemaBaselines.listAll())[0]?.revisions).toHaveLength(2);
    });

    test("rejects absent packages, unapproved provenance, selectors, and dependency pins", async () => {
        const fixture = await baselineImportFixture();
        const cases = [
            await reviewedBaseline("wrong-package", { kind: "demo", packageDigest: "d".repeat(64) }),
            { ...fixture.baseline, environment: { ...fixture.baseline.environment, postgresVersion: "17" } },
            { ...fixture.baseline, legacySelector: { provider: "supabase", root: "connectors/other" } },
            {
                ...fixture.baseline,
                dependencies: [{ kind: "ghost", version: "1.0.0", packageDigest: "e".repeat(64) }],
            },
        ];

        for (const baseline of cases) {
            const request = await importRequest(baseline);
            await expect(fixture.importer.importBaseline(request)).rejects.toMatchObject({
                status: expect.any(Number),
                code: expect.stringContaining("reviewed_schema_baseline_import_"),
            });
        }
        expect(await fixture.reviewedSchemaBaselines.listAll()).toEqual([]);
    });

    test("binds approved connector targets to the exact package digest", async () => {
        const fixture = await baselineImportFixture();
        const importer = new FsReviewedSchemaBaselineImporter({
            ...fixture.config,
            approvedTargets: fixture.config.approvedTargets.map((target) => ({
                ...target,
                packageDigest: "f".repeat(64),
            })),
        });

        await expect(importer.importBaseline(fixture.request)).rejects.toMatchObject({
            status: 422,
            code: "reviewed_schema_baseline_import_unapproved",
        });
    });
});
