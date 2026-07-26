import { identifyObservedSchemaContract } from "@bernouy/cms-integrations";
import { parseReviewedSchemaBaseline, type ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";

export const PACKAGE_DIGEST = "a".repeat(64);
const ENVIRONMENT_DIGEST = "b".repeat(64);
const IMAGE_DIGEST = `sha256:${"c".repeat(64)}`;
const CREATED_AT = "2026-07-26T10:00:00.000Z";

export async function reviewedBaseline(
    reportId = "baseline-root",
    options: Readonly<{
        supersedes?: string;
        reason?: string;
    }> = {},
): Promise<ReviewedSchemaBaselineV1> {
    const observedSchema = {
        schema: "cms.integration.observed-schema.v1",
        owner: { connectorKey: "primary", lineageId: "example-supabase-v1" },
        namespaces: [{ name: "public", relations: [] }],
    } as const;
    return await parseReviewedSchemaBaseline({
        schema: "cms.integration.reviewed-schema-baseline.v1",
        reportId,
        revisionType: options.supersedes ? "revision" : "root",
        origin: "legacy-backfill",
        createdAt: CREATED_AT,
        ...(options.supersedes ? { supersedes: options.supersedes } : {}),
        kind: "example",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        connectorKey: "primary",
        lineageId: "example-supabase-v1",
        legacySelector: { provider: "supabase", root: "connectors/supabase" },
        dependencies: [],
        observedSchema,
        observedSchemaDigest: (await identifyObservedSchemaContract(observedSchema)).digest,
        generator: { name: "cms-schema-generator", version: "1.0.0", imageDigest: IMAGE_DIGEST },
        environment: { digest: ENVIRONMENT_DIGEST, postgresVersion: "16.10" },
        policy: { name: "legacy-schema-baseline", version: "1.0.0" },
        generatedAt: CREATED_AT,
        provenance: {
            actor: "official-integrations-ci",
            reason: options.reason ?? "Reviewed pinned schema observation.",
            evidenceIds: ["observed-example"],
        },
    });
}
