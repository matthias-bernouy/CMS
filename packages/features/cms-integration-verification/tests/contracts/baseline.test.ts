import { describe, expect, test } from "bun:test";
import { identifyObservedSchemaContract } from "@bernouy/cms-integrations";
import { parseReviewedSchemaBaseline } from "../../src/exports/index";
import { CREATED_AT, DIGEST_A, DIGEST_B, IMAGE_A, provenance } from "./fixtures";

function observedSchema(connectorKey = "primary") {
    return {
        schema: "cms.integration.observed-schema.v1",
        owner: { connectorKey, lineageId: "example-supabase-v1" },
        namespaces: [{ name: "public", relations: [] }],
    } as const;
}

async function baseline() {
    const observed = observedSchema();
    return {
        schema: "cms.integration.reviewed-schema-baseline.v1",
        reportId: "baseline-1",
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: CREATED_AT,
        kind: "example",
        version: "1.0.0",
        packageDigest: DIGEST_A,
        connectorKey: "primary",
        lineageId: "example-supabase-v1",
        legacySelector: { provider: "supabase", root: "connectors/supabase" },
        dependencies: [{ kind: "dependency", version: "1.0.0", packageDigest: DIGEST_B }],
        observedSchema: observed,
        observedSchemaDigest: (await identifyObservedSchemaContract(observed)).digest,
        generator: { name: "cms-postgres", version: "1.0.0", imageDigest: IMAGE_A },
        environment: { digest: DIGEST_B, postgresVersion: "16.4" },
        policy: { name: "legacy-schema-baseline", version: "1.0.0" },
        generatedAt: CREATED_AT,
        provenance: provenance(),
    };
}

describe("reviewed schema baseline contract", () => {
    test("binds a canonical observed contract to the full reviewed identity", async () => {
        const value = await baseline();
        const parsed = await parseReviewedSchemaBaseline(value);

        expect(parsed).toEqual(value);
        expect(parsed.origin).toBe("legacy-backfill");
        expect(parsed.packageDigest).toBe(DIGEST_A);
        expect(parsed.generator.imageDigest).toBe(IMAGE_A);
    });

    test("rejects schema content that does not match its digest", async () => {
        const value = await baseline();
        await expect(parseReviewedSchemaBaseline({ ...value, observedSchemaDigest: DIGEST_B })).rejects.toThrow(
            /does not match the canonical observed schema/,
        );
    });

    test("requires stable connector ownership to agree with observation", async () => {
        const value = await baseline();
        await expect(
            parseReviewedSchemaBaseline({ ...value, observedSchema: observedSchema("secondary") }),
        ).rejects.toThrow(/owner must match connectorKey and lineageId/);
    });

    test("enforces append-only root and revision shape", async () => {
        const value = await baseline();
        await expect(parseReviewedSchemaBaseline({ ...value, supersedes: "baseline-0" })).rejects.toThrow(
            /root report cannot supersede/,
        );
        const revision = await parseReviewedSchemaBaseline({
            ...value,
            reportId: "baseline-2",
            revisionType: "revision",
            supersedes: "baseline-1",
        });
        expect(revision.supersedes).toBe("baseline-1");
    });
});
