import { describe, expect, test } from "bun:test";
import { IntegrationRepositoryContractError, IntegrationRepositoryUnavailableError } from "@bernouy/cms-integrations";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";

describe("HttpIntegrationDefinitionRepository errors", () => {
    test("maps transport failures, upstream throttling, and server errors to 503", async () => {
        const transport = repository(async () => {
            throw new Error("connect ECONNREFUSED internal-repository:4210");
        });
        await expectUnavailable(transport.list());

        for (const status of [429, 500, 503]) {
            const upstream = repository(async () => new Response("private upstream body", { status }));
            const error = await rejected(upstream.list());
            expect(error).toBeInstanceOf(IntegrationRepositoryUnavailableError);
            expect(error).toMatchObject({
                status: 503,
                publicCode: "integration_repository_unavailable",
                message: "Integration repository is unavailable",
            });
            expect(String(error)).not.toContain("private upstream body");
        }
    });

    test("enforces the configured request timeout even when fetch ignores abort", async () => {
        const repo = repository(
            async () =>
                await new Promise<Response>(() => {
                    // A deliberately stuck transport proves the timeout does not rely on fetch rejecting on abort.
                }),
            5,
        );

        await expectUnavailable(repo.list());
    });

    test("maps malformed JSON, invalid schemas, identities, and client statuses to 502", async () => {
        const malformedJson = repository(
            async () => new Response('{"private":"unterminated"', { headers: { "content-type": "application/json" } }),
        );
        await expectInvalid(malformedJson.list());

        const invalidSchema = repository(async () => Response.json({ summaries: [] }));
        await expectInvalid(invalidSchema.list());

        const wrongIdentity = repository(async () =>
            Response.json({ kind: "other", label: "Other", version: "1.0.0", inputs: [] }),
        );
        await expectInvalid(wrongIdentity.get("expected", "1.0.0"));

        const clientFailure = repository(async () => new Response("internal route detail", { status: 400 }));
        await expectInvalid(clientFailure.list());
    });

    test("preserves nullable 404 behavior", async () => {
        const repo = repository(async () => new Response(null, { status: 404 }));

        expect(await repo.get("missing", "1.0.0")).toBeNull();
        expect(await repo.getIndex("missing")).toBeNull();
        expect(await repo.listVersions("missing")).toEqual([]);
        expect(await repo.getAsset("missing", "1.0.0", "asset.svg")).toBeNull();
    });

    test("rejects unbounded or invalid timeout configuration", () => {
        expect(
            () =>
                new HttpIntegrationDefinitionRepository({
                    baseUrl: "https://repo.example.test",
                    timeoutMs: 0,
                }),
        ).toThrow(/positive integer/);
        expect(
            () =>
                new HttpIntegrationDefinitionRepository({
                    baseUrl: "https://repo.example.test",
                    timeoutMs: Number.POSITIVE_INFINITY,
                }),
        ).toThrow(/positive integer/);
    });
});

function repository(fetchImpl: typeof fetch, timeoutMs = 100): HttpIntegrationDefinitionRepository {
    return new HttpIntegrationDefinitionRepository({
        baseUrl: "https://repo.example.test",
        fetch: fetchImpl,
        timeoutMs,
    });
}

async function expectUnavailable(operation: Promise<unknown>): Promise<void> {
    const error = await rejected(operation);
    expect(error).toBeInstanceOf(IntegrationRepositoryUnavailableError);
    expect(error).toMatchObject({
        status: 503,
        publicCode: "integration_repository_unavailable",
        message: "Integration repository is unavailable",
    });
    expect(String(error)).not.toContain("internal-repository");
}

async function expectInvalid(operation: Promise<unknown>): Promise<void> {
    const error = await rejected(operation);
    expect(error).toBeInstanceOf(IntegrationRepositoryContractError);
    expect(error).toMatchObject({
        status: 502,
        publicCode: "integration_repository_invalid_response",
        message: "Integration repository returned an invalid response",
    });
    expect(String(error)).not.toContain("internal route detail");
}

async function rejected(operation: Promise<unknown>): Promise<unknown> {
    try {
        await operation;
    } catch (error) {
        return error;
    }
    throw new Error("expected operation to reject");
}
