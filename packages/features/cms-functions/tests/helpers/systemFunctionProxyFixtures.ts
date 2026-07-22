import {
    executeFunctionSystemSourceEndpoint,
    InMemoryFunctionRepository,
    withFunctionsSource,
    type CmsFunction,
} from "@bernouy/cms-functions";
import {
    handleSourceRequest,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
    type SourceAuthorizationResult,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import { FunctionExecutionProbe } from "./functionExecutionProbe";

const PREFIX = "/.cms/sources/";

export async function systemFunctionProxyHarness(upstreamStatus = 200) {
    const sources = new InMemorySourceRepository();
    const overlays = new InMemorySourceOverlayRepository();
    const storedFunctions = new InMemoryFunctionRepository();
    await sources.createSource(ordersSource());
    await overlays.upsertOverlay({
        id: "order-metadata",
        sourceId: "orders",
        output: [{ endpointId: "getOrder" }],
        fields: [{ id: "reference", label: "Reference", type: "string", required: true }],
    });
    await storedFunctions.createFunction(readOrderFunction("v1"));

    const overlaySources = new SourceOverlaySourceRepository(sources, overlays);
    const probe = new FunctionExecutionProbe(overlaySources);
    const functions = probe.functions(storedFunctions);
    const proxiedSources = withFunctionsSource(probe.sources, functions);
    const authorizedEndpoints: SourceEndpoint[] = [];
    const executedEndpoints: SourceEndpoint[] = [];
    const upstreamRequests: Array<{ method: string; url: string }> = [];

    return {
        probe,
        storedFunctions,
        authorizedEndpoints,
        executedEndpoints,
        upstreamRequests,
        request: (authorization: SourceAuthorizationResult = true) =>
            handleSourceRequest(
                proxiedSources,
                new Request(`${origin()}${PREFIX}system-functions/readOrder?orderId=order-1`),
                {
                    prefix: PREFIX,
                    deps: {
                        authorizeEndpoint: (endpoint) => {
                            authorizedEndpoints.push(structuredClone(endpoint));
                            return authorization;
                        },
                        executeSystemEndpoint: (endpoint, request) => {
                            executedEndpoints.push(structuredClone(endpoint));
                            return executeFunctionSystemSourceEndpoint(endpoint, request, {
                                functions,
                                sources: probe.sources,
                                deps: probe.deps({
                                    fetchImpl: async (input, init) => {
                                        const upstream = new Request(input, init);
                                        upstreamRequests.push({ method: upstream.method, url: upstream.url });
                                        return Response.json(
                                            {
                                                id: "order-1",
                                                internalState: "must-be-projected-out",
                                                metadata: {
                                                    reference: "REF-001",
                                                    privateNote: "must-be-projected-out",
                                                },
                                            },
                                            { status: upstreamStatus },
                                        );
                                    },
                                }),
                                resolveUser: async () => ({ id: "admin-1", role: "admin" }),
                            });
                        },
                    },
                },
            ),
    };
}

export function readOrderFunction(version: string): CmsFunction {
    return {
        id: "readOrder",
        method: "GET",
        access: { mode: "admin" },
        meta: { name: `Read order ${version}` },
        input: { params: { orderId: { type: "string" } } },
        steps: [
            {
                id: "order",
                call: { source: "orders", endpoint: "getOrder", params: { orderId: "$input.params.orderId" } },
            },
        ],
        return: { body: { version, order: "$steps.order" } },
    };
}

function ordersSource() {
    return {
        urn: "urn:orders",
        endpoints: [
            {
                urn: "urn:orders:getOrder",
                method: "GET" as const,
                targetUrl: "https://orders.test/orders/{orderId}",
                input: {
                    params: [
                        {
                            name: "orderId",
                            in: "path" as const,
                            required: true,
                            schema: { type: "string" as const },
                        },
                    ],
                },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object" as const,
                            properties: { id: { type: "string" as const } },
                            required: ["id"],
                        },
                    },
                ],
            },
        ],
    };
}

function origin(): string {
    return "https://cms.test";
}
