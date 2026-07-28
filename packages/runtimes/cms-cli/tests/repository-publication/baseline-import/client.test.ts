import { afterEach, describe, expect, test } from "bun:test";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { importOfficialReviewedSchemaBaseline } from "../../../src/repositoryPublication/baselineImportClient";
import { officialBaseline } from "./fixtures";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
});

describe("repository maintenance baseline import client", () => {
    test("posts canonical bytes with the maintenance credential", async () => {
        const baseline = officialBaseline();
        const baselineDigest = await sha256Hex(canonicalJsonBytes(baseline));
        let captured: { authorization: string | null; pathname: string; body: Uint8Array } | undefined;
        const server = serve(async (request) => {
            captured = {
                authorization: request.headers.get("authorization"),
                pathname: new URL(request.url).pathname,
                body: new Uint8Array(await request.arrayBuffer()),
            };
            return json(201, success(baselineDigest));
        });

        const result = await importOfficialReviewedSchemaBaseline(config(server), baseline);

        expect(result).toEqual({
            outcome: "imported",
            operationId: "operation-1",
            baselineDigest,
            currentRevisionId: baseline.reportId,
        });
        expect(captured?.authorization).toBe("Bearer maintenance-token");
        expect(captured?.pathname).toBe("/.cms/repository-management/api/integrations/schema-baselines");
        expect(captured?.body).toEqual(
            canonicalJsonBytes({
                schema: "cms.integration.reviewed-schema-baseline-import.v1",
                baselineDigest,
                baseline,
                expectedCurrent: null,
            }),
        );
    });

    test("accepts an exact idempotent replay and rejects substituted success identity", async () => {
        const baseline = officialBaseline();
        const digest = await sha256Hex(canonicalJsonBytes(baseline));
        const exact = serve(() => json(200, { ...success(digest), outcome: "unchanged" }));
        expect(await importOfficialReviewedSchemaBaseline(config(exact), baseline)).toMatchObject({
            outcome: "unchanged",
            baselineDigest: digest,
        });

        const mismatch = serve(() => json(201, { ...success("e".repeat(64)), kind: "other" }));
        expect(await importOfficialReviewedSchemaBaseline(config(mismatch), baseline)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 201,
        });
    });

    test("returns only allowlisted rejection metadata", async () => {
        const server = serve(() =>
            json(
                422,
                { code: "reviewed_schema_baseline_import_unapproved", error: "secret internal path" },
                { "retry-after": "12" },
            ),
        );

        expect(await importOfficialReviewedSchemaBaseline(config(server), officialBaseline())).toEqual({
            outcome: "failed",
            reason: "rejected",
            status: 422,
            code: "reviewed_schema_baseline_import_unapproved",
            retryAfterSeconds: 12,
        });
    });

    test("bounds streamed responses, enforces JSON, and times out", async () => {
        const oversized = serve(
            () => new Response("x".repeat(1_048_577), { headers: { "content-type": "application/json" } }),
        );
        expect(await importOfficialReviewedSchemaBaseline(config(oversized), officialBaseline())).toMatchObject({
            outcome: "failed",
            reason: "invalid-response",
        });

        const wrongType = serve(() => new Response("{}", { status: 201, headers: { "content-type": "text/plain" } }));
        expect(await importOfficialReviewedSchemaBaseline(config(wrongType), officialBaseline())).toMatchObject({
            outcome: "failed",
            reason: "invalid-response",
        });

        const delayed = serve(async () => {
            await Bun.sleep(50);
            return json(201, {});
        });
        expect(
            await importOfficialReviewedSchemaBaseline({ ...config(delayed), timeoutMs: 5 }, officialBaseline()),
        ).toEqual({ outcome: "failed", reason: "timeout" });
    });
});

function success(baselineDigest: string) {
    const baseline = officialBaseline();
    return {
        outcome: "imported",
        operationId: "operation-1",
        kind: baseline.kind,
        version: baseline.version,
        packageDigest: baseline.packageDigest,
        baselineDigest,
        currentRevisionId: baseline.reportId,
    };
}

function serve(fetchHandler: (request: Request) => Response | Promise<Response>): Bun.Server<unknown> {
    const server = Bun.serve({ port: 0, fetch: fetchHandler });
    servers.push(server);
    return server;
}

function config(server: Bun.Server<unknown>) {
    return {
        maintenanceUrl: `${origin(server)}/.cms/repository-management`,
        token: "maintenance-token",
        timeoutMs: 500,
    };
}

function origin(server: Bun.Server<unknown>): string {
    return `http://127.0.0.1:${server.port}`;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return Response.json(body, { status, headers });
}
