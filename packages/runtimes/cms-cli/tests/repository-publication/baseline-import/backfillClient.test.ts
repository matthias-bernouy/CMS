import { afterEach, describe, expect, test } from "bun:test";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    backfillOfficialIntegrationVerification,
    officialVerificationBackfillRequest,
} from "../../../src/repositoryPublication/maintenance/backfillClient";
import { officialVerificationBackfills } from "./fixtures";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
});

describe("repository maintenance verification backfill client", () => {
    test("posts canonical exact evidence with the maintenance credential", async () => {
        const entry = (await officialVerificationBackfills())[0]!;
        let captured: { authorization: string | null; pathname: string; body: Uint8Array } | undefined;
        const server = serve(async (request) => {
            captured = {
                authorization: request.headers.get("authorization"),
                pathname: new URL(request.url).pathname,
                body: new Uint8Array(await request.arrayBuffer()),
            };
            return json(201, await success(entry));
        });

        const result = await backfillOfficialIntegrationVerification(config(server), entry);

        expect(result).toMatchObject({
            outcome: "backfilled",
            kind: entry.verification.envelope.target.kind,
            packageDigest: entry.verification.envelope.target.packageDigest,
            verificationDigest: entry.verification.digest,
            decisionRevisionId: entry.decision.decisionId,
        });
        expect(captured?.authorization).toBe("Bearer maintenance-token");
        expect(captured?.pathname).toBe("/.cms/repository-management/api/integrations/verification-backfills");
        expect(captured?.body).toEqual(canonicalJsonBytes(officialVerificationBackfillRequest(entry)));
    }, 20_000);

    test("accepts an exact replay and rejects a substituted success identity", async () => {
        const entry = (await officialVerificationBackfills())[0]!;
        const exact = serve(async () => json(200, { ...(await success(entry)), outcome: "unchanged" }));
        expect(await backfillOfficialIntegrationVerification(config(exact), entry)).toMatchObject({
            outcome: "unchanged",
            verificationDigest: entry.verification.digest,
        });

        const mismatch = serve(async () => json(201, { ...(await success(entry)), packageDigest: "f".repeat(64) }));
        expect(await backfillOfficialIntegrationVerification(config(mismatch), entry)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 201,
        });
    });

    test("returns only allowlisted rejection metadata", async () => {
        const entry = (await officialVerificationBackfills())[0]!;
        const server = serve(() =>
            json(
                409,
                { code: "verification_backfill_conflict", error: "secret internal path" },
                { "retry-after": "12" },
            ),
        );

        expect(await backfillOfficialIntegrationVerification(config(server), entry)).toEqual({
            outcome: "failed",
            reason: "rejected",
            status: 409,
            code: "verification_backfill_conflict",
            retryAfterSeconds: 12,
        });
    });

    test("bounds streamed responses, enforces JSON, and times out", async () => {
        const entry = (await officialVerificationBackfills())[0]!;
        const oversized = serve(
            () => new Response("x".repeat(1_048_577), { headers: { "content-type": "application/json" } }),
        );
        expect(await backfillOfficialIntegrationVerification(config(oversized), entry)).toMatchObject({
            outcome: "failed",
            reason: "invalid-response",
        });

        const wrongType = serve(() => new Response("{}", { status: 201, headers: { "content-type": "text/plain" } }));
        expect(await backfillOfficialIntegrationVerification(config(wrongType), entry)).toMatchObject({
            outcome: "failed",
            reason: "invalid-response",
        });

        const delayed = serve(async () => {
            await Bun.sleep(50);
            return json(201, {});
        });
        expect(await backfillOfficialIntegrationVerification({ ...config(delayed), timeoutMs: 5 }, entry)).toEqual({
            outcome: "failed",
            reason: "timeout",
        });
    });
});

async function success(entry: Awaited<ReturnType<typeof officialVerificationBackfills>>[number]) {
    const target = entry.verification.envelope.target;
    return {
        outcome: "backfilled",
        operationId: "operation-1",
        kind: target.kind,
        version: target.version,
        packageDigest: target.packageDigest,
        verificationDigest: entry.verification.digest,
        decisionRevisionId: entry.decision.decisionId,
        decisionDigest: await sha256Hex(canonicalJsonBytes(entry.decision)),
    };
}

function serve(fetchHandler: (request: Request) => Response | Promise<Response>): Bun.Server<unknown> {
    const server = Bun.serve({ port: 0, fetch: fetchHandler });
    servers.push(server);
    return server;
}

function config(server: Bun.Server<unknown>) {
    return {
        maintenanceUrl: `http://127.0.0.1:${server.port}/.cms/repository-management`,
        token: "maintenance-token",
        timeoutMs: 500,
    };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return Response.json(body, { status, headers });
}
