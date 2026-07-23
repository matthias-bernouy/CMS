import { describe, expect, test } from "bun:test";
import { type CmsFunction, validateFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository, makeEndpointUrn, makeSourceUrn, type EndpointResponse } from "@bernouy/cms-sources";

const errorStatuses = [400, 403, 404, 409, 422] as const;

describe("declared function call error validation", () => {
    test("accepts bounded mappings declared by both the source and function", async () => {
        expect(await validateFunction(workflow(), { sources: await sources() })).toEqual([]);
    });

    test("requires exact source and function response contracts", async () => {
        const missingSource = await sources();
        const source = await missingSource.getSource(makeSourceUrn("commerce"));
        const endpoint = source!.endpoints.find(
            (candidate) => candidate.urn === makeEndpointUrn("commerce", "createOrder"),
        );
        endpoint!.output = endpoint!.output?.filter((output) => output.status !== "422");
        await missingSource.updateSource(source!);

        expect(await validateFunction(workflow(), { sources: missingSource })).toContain(
            'function.steps.0.call.onError.propagate.4.sourceStatus 422 must be explicitly declared by endpoint "urn:commerce:createOrder"',
        );

        const missingFunction = workflow();
        missingFunction.output = missingFunction.output?.filter((output) => output.status !== "422");
        expect(await validateFunction(missingFunction, { sources: await sources() })).toContain(
            "function.steps.0.call.onError.propagate.4.status 422 must be explicitly declared by function.output",
        );
    });

    test("rejects credential and server statuses, duplicates, and empty policies", async () => {
        const invalid = workflow();
        const call = (invalid.steps[0] as Extract<CmsFunction["steps"][number], { call: unknown }>).call;
        call.onError = {
            propagate: [
                { sourceStatus: 401, status: 400 },
                { sourceStatus: 500, status: 500 },
                { sourceStatus: 400, status: 400 },
                { sourceStatus: 400, status: 403 },
            ],
        };
        const errors = await validateFunction(invalid, { sources: await sources() });

        expect(errors).toEqual(
            expect.arrayContaining([
                "function.steps.0.call.onError.propagate.0.sourceStatus must be one of 400, 403, 404, 409, 422",
                "function.steps.0.call.onError.propagate.1.sourceStatus must be one of 400, 403, 404, 409, 422",
                "function.steps.0.call.onError.propagate.1.status must be one of 400, 403, 404, 409, 422",
                "function.steps.0.call.onError.propagate.3.sourceStatus duplicates 400",
            ]),
        );

        call.onError = { propagate: [] };
        expect(await validateFunction(invalid, { sources: await sources() })).toContain(
            "function.steps.0.call.onError.propagate must be a non-empty array",
        );
    });
});

function workflow(): CmsFunction {
    return {
        id: "createProtectedOrder",
        method: "POST",
        output: [{ status: "200", body: { type: "object" } }, ...errorStatuses.map(errorResponse)],
        steps: [
            {
                id: "order",
                call: {
                    source: "commerce",
                    endpoint: "createOrder",
                    onError: {
                        propagate: errorStatuses.map((status) => ({ sourceStatus: status, status })),
                    },
                },
            },
        ],
        return: { body: "$steps.order" },
    };
}

async function sources(): Promise<InMemorySourceRepository> {
    const repository = new InMemorySourceRepository();
    await repository.createSource({
        urn: makeSourceUrn("commerce"),
        endpoints: [
            {
                urn: makeEndpointUrn("commerce", "createOrder"),
                method: "POST",
                targetUrl: "https://commerce.test/orders",
                output: [{ status: "200", body: { type: "object" } }, ...errorStatuses.map(errorResponse)],
            },
        ],
    });
    return repository;
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
