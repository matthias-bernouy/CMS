import { identifyReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import {
    REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
    type ReviewedSchemaBaselineImportApproval,
    type ReviewedSchemaBaselineImportRequest,
} from "@bernouy/cms-integration-registry";
import {
    FsReviewedSchemaBaselineImporter,
    type FsReviewedSchemaBaselineImporterConfig,
} from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../fixtures";
import { registryFixture, seedLegacySqlBaseline } from "../../publication/fixtures";

export const IMPORT_APPROVAL: ReviewedSchemaBaselineImportApproval = Object.freeze({
    generator: { name: "cms-schema-generator", version: "1.0.0", imageDigest: `sha256:${"c".repeat(64)}` },
    environments: [{ digest: "b".repeat(64), postgresVersion: "16.10" }],
    policy: { name: "legacy-schema-baseline", version: "1.0.0" },
    provenanceActors: ["official-integrations-ci"],
});

export async function baselineImportFixture(overrides: Partial<FsReviewedSchemaBaselineImporterConfig> = {}) {
    const fixture = registryFixture();
    const integrationPackage = await seedLegacySqlBaseline(fixture);
    const baseline = await reviewedBaseline("baseline-demo", {
        kind: "demo",
        packageDigest: integrationPackage.digest,
    });
    const request = await importRequest(baseline);
    const config: FsReviewedSchemaBaselineImporterConfig = {
        root: fixture.root,
        snapshots: fixture.snapshots,
        store: fixture.reviewedSchemaBaselines,
        mutations: fixture.mutations,
        approval: IMPORT_APPROVAL,
        approvedTargets: [
            {
                kind: "demo",
                version: "1.0.0",
                packageDigest: integrationPackage.digest,
                connectorKey: "primary",
                lineageId: "demo-supabase-v1",
            },
        ],
        createOperationId: () => "baseline-import-1",
        now: () => "2026-07-26T12:00:00.000Z",
        ...overrides,
    };
    return {
        ...fixture,
        integrationPackage,
        baseline,
        request,
        config,
        importer: new FsReviewedSchemaBaselineImporter(config),
    };
}

export async function importRequest(
    baseline: Awaited<ReturnType<typeof reviewedBaseline>>,
    expectedCurrent: ReviewedSchemaBaselineImportRequest["expectedCurrent"] = null,
): Promise<ReviewedSchemaBaselineImportRequest> {
    return {
        schema: REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
        baselineDigest: (await identifyReviewedSchemaBaseline(baseline)).digest,
        baseline,
        expectedCurrent,
    };
}
