import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyReviewedSchemaBaselineImportRequest,
    REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
    ReviewedSchemaBaselineImportError,
    type ReviewedSchemaBaselineImporter,
    type ReviewedSchemaBaselineImportRequest,
} from "@bernouy/cms-integration-registry";
import {
    mountRepositorySchemaBaselineImportRoutes,
    REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH,
} from "@bernouy/cms-repository-management";
import type { RouteHandler, Runner } from "@bernouy/http-runner";

describe("repository reviewed schema baseline maintenance route", () => {
    test("accepts only canonical requests and preserves importer outcomes", async () => {
        const importer = new RecordingImporter();
        const runner = configuredRunner(importer);
        const body = await importBody();

        const imported = await runner.request(canonicalJsonBytes(body));
        importer.outcome = "unchanged";
        const unchanged = await runner.request(canonicalJsonBytes(body));

        expect(imported.status).toBe(201);
        expect(await imported.json()).toMatchObject({ outcome: "imported", baselineDigest: body.baselineDigest });
        expect(unchanged.status).toBe(200);
        expect(await unchanged.json()).toMatchObject({ outcome: "unchanged" });
        expect(importer.requests).toEqual([body, body]);
    });

    test("rejects non-canonical, oversized, malformed, and digest-substituted bodies before delegation", async () => {
        const importer = new RecordingImporter();
        const runner = configuredRunner(importer, 16_384);
        const body = await importBody();
        const nonCanonical = new TextEncoder().encode(JSON.stringify(body, null, 2));
        const substituted = canonicalJsonBytes({ ...body, baselineDigest: "f".repeat(64) });
        const duplicate = new TextEncoder().encode(
            new TextDecoder()
                .decode(canonicalJsonBytes(body))
                .replace(
                    '"schema":"cms.integration.reviewed-schema-baseline-import.v1"',
                    '"schema":"cms.integration.reviewed-schema-baseline-import.v1","schema":"cms.integration.reviewed-schema-baseline-import.v1"',
                ),
        );

        for (const [bytes, status, code] of [
            [nonCanonical, 400, "reviewed_schema_baseline_import_invalid"],
            [new TextEncoder().encode("{"), 400, "reviewed_schema_baseline_import_invalid"],
            [substituted, 400, "reviewed_schema_baseline_import_invalid"],
            [duplicate, 400, "reviewed_schema_baseline_import_invalid"],
            [new Uint8Array(16_385), 413, "reviewed_schema_baseline_import_too_large"],
        ] as const) {
            const response = await runner.request(bytes);
            expect(response.status).toBe(status);
            expect(await response.json()).toMatchObject({ code });
        }
        expect(importer.requests).toEqual([]);
    });

    test("maps domain failures without exposing adapter details", async () => {
        const body = await importBody();
        for (const [status, code] of [
            [404, "reviewed_schema_baseline_import_not_found"],
            [409, "reviewed_schema_baseline_import_conflict"],
            [422, "reviewed_schema_baseline_import_unapproved"],
            [503, "reviewed_schema_baseline_import_recovery_required"],
        ] as const) {
            const runner = configuredRunner(
                new RecordingImporter(new ReviewedSchemaBaselineImportError(status, code, "secret /var/lib/path")),
            );
            const response = await runner.request(canonicalJsonBytes(body));
            const text = await response.text();
            expect(response.status).toBe(status);
            expect(JSON.parse(text)).toMatchObject({ code });
            expect(text).not.toContain("secret");
            expect(text).not.toContain("/var/lib/path");
        }
    });
});

class SchemaBaselineImportTestRunner {
    private handler?: RouteHandler;

    post(path: string, handler: RouteHandler): void {
        expect(path).toBe(REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH);
        this.handler = handler;
    }

    async request(bytes: Uint8Array): Promise<Response> {
        if (!this.handler) {
            throw new Error("Schema baseline import handler was not mounted");
        }
        return await this.handler(
            new Request(`http://localhost${REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH}`, {
                method: "POST",
                headers: { "content-length": String(bytes.byteLength), "content-type": "application/json" },
                body: bytes,
            }),
        );
    }
}

class RecordingImporter implements ReviewedSchemaBaselineImporter {
    readonly requests: ReviewedSchemaBaselineImportRequest[] = [];
    outcome: "imported" | "unchanged" = "imported";

    constructor(private readonly failure?: Error) {}

    async importBaseline(request: ReviewedSchemaBaselineImportRequest) {
        this.requests.push(request);
        if (this.failure) {
            throw this.failure;
        }
        return {
            operationId: "import-1",
            outcome: this.outcome,
            kind: request.baseline.kind,
            version: request.baseline.version,
            packageDigest: request.baseline.packageDigest,
            baselineDigest: request.baselineDigest,
            currentRevisionId: request.baseline.reportId,
        } as const;
    }
}

function configuredRunner(importer: ReviewedSchemaBaselineImporter, maxBodyBytes = 16 * 1_024 * 1_024) {
    const runner = new SchemaBaselineImportTestRunner();
    mountRepositorySchemaBaselineImportRoutes(runner as unknown as Runner, { importer, maxBodyBytes });
    return runner;
}

async function importBody(): Promise<ReviewedSchemaBaselineImportRequest> {
    const observedSchema = {
        schema: "cms.integration.observed-schema.v1",
        owner: { connectorKey: "primary", lineageId: "demo-supabase-v1" },
        namespaces: [{ name: "public", relations: [] }],
    } as const;
    const baseline = {
        schema: "cms.integration.reviewed-schema-baseline.v1",
        reportId: "baseline-demo",
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T12:00:00.000Z",
        kind: "demo",
        version: "1.0.0",
        packageDigest: "a".repeat(64),
        connectorKey: "primary",
        lineageId: "demo-supabase-v1",
        legacySelector: { provider: "supabase", root: "connectors/supabase" },
        dependencies: [],
        observedSchema,
        observedSchemaDigest: await sha256Hex(canonicalJsonBytes(observedSchema)),
        generator: { name: "cms-schema-generator", version: "1.0.0", imageDigest: `sha256:${"c".repeat(64)}` },
        environment: { digest: "b".repeat(64), postgresVersion: "16.10" },
        policy: { name: "legacy-schema-baseline", version: "1.0.0" },
        generatedAt: "2026-07-26T12:00:00.000Z",
        provenance: { actor: "official-integrations-ci", reason: "Reviewed observation" },
    } as const;
    const baselineDigest = await sha256Hex(canonicalJsonBytes(baseline));
    return (
        await identifyReviewedSchemaBaselineImportRequest({
            schema: REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
            baselineDigest,
            baseline,
            expectedCurrent: null,
        })
    ).request;
}
