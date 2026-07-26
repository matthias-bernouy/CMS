import { afterEach, describe, expect, test } from "bun:test";
import type { OfficialIntegrationPackage } from "../../src/repositoryPublication/officialPackages";
import { publishOfficialIntegrationPackage } from "../../src/repositoryPublication/managementClient";

const servers: Bun.Server<unknown>[] = [];
const DIGEST = "a".repeat(64);
const PACKAGE: OfficialIntegrationPackage = {
    kind: "demo",
    version: "1.0.0",
    digest: DIGEST,
    canonicalBytes: new TextEncoder().encode('{"kind":"demo"}'),
};

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
});

describe("official repository management HTTP client", () => {
    test("publishes canonical bytes over a real authenticated HTTP request", async () => {
        let captured: { authorization: string | null; pathname: string; body: string } | undefined;
        const server = serve(async (request) => {
            captured = {
                authorization: request.headers.get("authorization"),
                pathname: new URL(request.url).pathname,
                body: await request.text(),
            };
            return json(201, {
                operationId: "operation-1",
                kind: PACKAGE.kind,
                version: PACKAGE.version,
                digest: PACKAGE.digest,
            });
        });

        const result = await publishOfficialIntegrationPackage(config(server), PACKAGE);

        expect(result).toEqual({ outcome: "published", operationId: "operation-1" });
        expect(captured).toEqual({
            authorization: "Bearer management-token",
            pathname: "/.cms/repository-management/api/integrations/publications",
            body: new TextDecoder().decode(PACKAGE.canonicalBytes),
        });
    });

    test("treats a 409 as idempotent only when identity and existing digest match", async () => {
        const exact = serve(() =>
            json(409, {
                code: "integration_version_exists",
                kind: PACKAGE.kind,
                version: PACKAGE.version,
                existingDigest: PACKAGE.digest,
            }),
        );
        expect(await publishOfficialIntegrationPackage(config(exact), PACKAGE)).toEqual({ outcome: "unchanged" });

        for (const existingDigest of [undefined, "b".repeat(64)]) {
            const mismatch = serve(() =>
                json(409, {
                    code: "integration_version_exists",
                    kind: PACKAGE.kind,
                    version: PACKAGE.version,
                    existingDigest,
                }),
            );
            expect(await publishOfficialIntegrationPackage(config(mismatch), PACKAGE)).toEqual({
                outcome: "failed",
                reason: "conflict",
                status: 409,
                code: "integration_version_exists",
            });
        }
    });

    test("returns allowlisted rejection metadata without exposing a raw response", async () => {
        const server = serve(() =>
            json(
                422,
                { code: "integration_compatibility_rejected", error: "raw management-secret filesystem details" },
                { "retry-after": "12" },
            ),
        );

        expect(await publishOfficialIntegrationPackage(config(server), PACKAGE)).toEqual({
            outcome: "failed",
            reason: "rejected",
            status: 422,
            code: "integration_compatibility_rejected",
            retryAfterSeconds: 12,
        });
    });

    test("bounds responses and times out real HTTP requests", async () => {
        const oversized = serve(() => new Response("x".repeat(1_048_577)));
        expect(await publishOfficialIntegrationPackage(config(oversized), PACKAGE)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 200,
        });

        const delayed = serve(async () => {
            await Bun.sleep(50);
            return json(201, {});
        });
        expect(await publishOfficialIntegrationPackage({ ...config(delayed), timeoutMs: 5 }, PACKAGE)).toEqual({
            outcome: "failed",
            reason: "timeout",
        });
    });

    test("rejects a JSON-looking body with the wrong media type", async () => {
        const server = serve(
            () =>
                new Response(
                    JSON.stringify({ operationId: "operation-1", kind: "demo", version: "1.0.0", digest: DIGEST }),
                    { status: 201, headers: { "content-type": "text/plain" } },
                ),
        );

        expect(await publishOfficialIntegrationPackage(config(server), PACKAGE)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 201,
        });
    });

    test("refuses redirects before a token can reach another origin", async () => {
        let targetCalls = 0;
        const target = serve(() => {
            targetCalls += 1;
            return json(201, {});
        });
        const redirect = serve(() => Response.redirect(`${origin(target)}/capture`, 302));

        expect(await publishOfficialIntegrationPackage(config(redirect), PACKAGE)).toEqual({
            outcome: "failed",
            reason: "transport",
        });
        expect(targetCalls).toBe(0);
    });
});

function serve(fetchHandler: (request: Request) => Response | Promise<Response>): Bun.Server<unknown> {
    const server = Bun.serve({ port: 0, fetch: fetchHandler });
    servers.push(server);
    return server;
}

function config(server: Bun.Server<unknown>) {
    return { managementUrl: `${origin(server)}/.cms/repository-management`, token: "management-token", timeoutMs: 500 };
}

function origin(server: Bun.Server<unknown>): string {
    return `http://127.0.0.1:${server.port}`;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return Response.json(body, { status, headers });
}
