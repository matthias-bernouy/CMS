import { describe, expect, test } from "bun:test";
import { executeFunction, type CmsFunction, type FunctionCallErrorMapping } from "@bernouy/cms-functions";
import { InMemorySourceRepository, makeEndpointUrn, makeSourceUrn, type EndpointResponse } from "@bernouy/cms-sources";
import { expectCorrelatedFunctionFailure } from "../../helpers/functionFixtures";

const businessStatuses = [400, 403, 404, 409, 422] as const;

describe("declared function call errors", () => {
    for (const status of businessStatuses) {
        test(`propagates an explicitly mapped ${status} response after strict source projection`, async () => {
            const response = await execute(status);

            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error: `business-${status}` });
        });
    }

    test("maps a declared source status to a different declared function status", async () => {
        const response = await execute(400, [{ sourceStatus: 400, status: 422 }]);

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "business-400" });
    });

    test("keeps credential, provider, server, and invalid projected failures behind 502", async () => {
        await expectMasked(401);
        await expectMasked(403, []);
        await expectMasked(500, [{ sourceStatus: 500, status: 500 } as FunctionCallErrorMapping]);
        await expectMasked(422, undefined, { message: "wrong contract", secret: "must-not-leak" });
    });
});

async function execute(
    sourceStatus: number,
    mappings: FunctionCallErrorMapping[] = businessStatuses.map((status) => ({ sourceStatus: status, status })),
    upstreamBody: unknown = { error: `business-${sourceStatus}`, secret: "must-not-leak" },
): Promise<Response> {
    const sources = new InMemorySourceRepository();
    await sources.createSource({
        urn: makeSourceUrn("commerce"),
        endpoints: [
            {
                urn: makeEndpointUrn("commerce", "createOrder"),
                method: "POST",
                targetUrl: "https://commerce.test/orders",
                output: [
                    { status: "200", body: { type: "object" } },
                    ...[...businessStatuses, 401, 500].map(errorResponse),
                ],
            },
        ],
    });
    return await executeFunction(
        workflow(mappings),
        new Request("https://cms.test/functions/order", { method: "POST" }),
        {
            sources,
            deps: {
                responseProjectionMode: "strict",
                fetchImpl: async () => Response.json(upstreamBody, { status: sourceStatus }),
            },
        },
    );
}

async function expectMasked(status: number, mappings?: FunctionCallErrorMapping[], body?: unknown): Promise<void> {
    const response = await execute(status, mappings, body);
    await expectCorrelatedFunctionFailure(response, 502);
}

function workflow(mappings: FunctionCallErrorMapping[]): CmsFunction {
    return {
        id: "createProtectedOrder",
        method: "POST",
        output: [{ status: "200", body: { type: "object" } }, ...businessStatuses.map(errorResponse)],
        steps: [
            {
                id: "order",
                call: {
                    source: "commerce",
                    endpoint: "createOrder",
                    ...(mappings.length ? { onError: { propagate: mappings } } : {}),
                },
            },
        ],
        return: { body: "$steps.order" },
    };
}

function errorResponse(status: number): EndpointResponse {
    return {
        status: String(status),
        body: {
            type: "object",
            properties: { error: { type: "string" } },
            required: ["error"],
        },
    };
}
