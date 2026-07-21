import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const commerceDefinitionUrl = new URL(
    "../../../../integrations/commerce/versions/1.0.0/definition.json",
    import.meta.url,
);
const compositionDefinitionUrl = new URL(
    "../../../../integrations/commerce-stripe-payments/versions/1.0.0/definition.json",
    import.meta.url,
);

describe("Commerce current seller identity contract", () => {
    test("declares the exact system Source projection", async () => {
        const endpoint = await currentSellerIdentityEndpoint();

        expect({
            method: endpoint.method,
            access: endpoint.access,
            targetUrl: endpoint.targetUrl,
            params: endpoint.params,
            headers: endpoint.headers,
        }).toEqual({
            method: "GET",
            access: "system",
            targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-commerce/system/seller/identity",
            params: [],
            headers: [
                {
                    name: "authorization",
                    source: {
                        from: "secret",
                        ref: "{{secrets.cmsApiKey}}",
                        prefix: "Bearer ",
                    },
                },
                {
                    name: "x-cms-user-id",
                    source: { from: "computed", ref: "userID" },
                },
            ],
        });
        expect(endpoint.output).toEqual([
            {
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        exists: { type: "boolean" },
                        id: {
                            type: "number",
                            semantic: "user-id",
                        },
                        cmsUserId: { type: "string" },
                    },
                },
            },
        ]);
        expect(endpoint.effects).toEqual({
            identityBindings: [{ kind: "user", responsePath: "id" }],
        });
    });

    test("uses the identity projection first without reordering later calls", async () => {
        const fn = await sellerPriceFunction();
        const calls = fn.steps
            ?.filter((step) => step.call)
            .map((step) => ({
                id: step.id,
                source: step.call?.source,
                endpoint: step.call?.endpoint,
            }));

        expect(calls).toEqual([
            {
                id: "seller",
                source: "{{dependencies.commerce.sourceId}}",
                endpoint: "getCurrentSellerIdentity",
            },
            {
                id: "connect",
                source: "{{dependencies.stripe.sourceId}}",
                endpoint: "getConnectStatus",
            },
            {
                id: "enrollment",
                source: "{{dependencies.stripe.sourceId}}",
                endpoint: "enrollConnectSeller",
            },
            {
                id: "result",
                source: "{{dependencies.commerce.sourceId}}",
                endpoint: "submitMyOfferPrice",
            },
        ]);
    });

    test("keeps the identity lookup outside dynamic seller overlays", async () => {
        const definition = JSON.parse(await readFile(commerceDefinitionUrl, "utf8"));
        const sellerOverlay = definition.artifacts?.find(
            (artifact: { overlay?: { id?: string } }) => artifact.overlay?.id === "{{answers.id}}-seller-custom-fields",
        )?.overlay;
        const outputEndpoints = sellerOverlay?.output?.map((output: { endpointId?: string }) => output.endpointId);

        expect(outputEndpoints).toEqual(["mySeller", "registerMySeller", "updateMySeller", "seller", "sellers"]);
    });
});

type Endpoint = {
    endpointId?: string;
    method?: string;
    access?: string;
    targetUrl?: string;
    params?: unknown[];
    headers?: unknown[];
    effects?: unknown;
    output?: Array<{
        status?: string;
        body?: {
            type?: string;
            properties?: Record<
                string,
                {
                    type?: string;
                    semantic?: unknown;
                }
            >;
            required?: string[];
        };
    }>;
};

type FunctionDefinition = {
    id?: string;
    steps?: Array<{
        id?: string;
        call?: { source?: string; endpoint?: string };
    }>;
};

async function currentSellerIdentityEndpoint(): Promise<Endpoint> {
    const definition = JSON.parse(await readFile(commerceDefinitionUrl, "utf8"));
    const endpoint = definition.artifacts
        ?.find((artifact: { source?: unknown }) => artifact.source)
        ?.source?.endpoints?.find((candidate: Endpoint) => candidate.endpointId === "getCurrentSellerIdentity");
    if (!endpoint) {
        throw new Error("Missing getCurrentSellerIdentity Source endpoint");
    }
    return endpoint;
}

async function sellerPriceFunction(): Promise<FunctionDefinition> {
    const definition = JSON.parse(await readFile(compositionDefinitionUrl, "utf8"));
    const fn = definition.artifacts?.find(
        (artifact: { function?: FunctionDefinition }) => artifact.function?.id === "submitSellerOfferPrice",
    )?.function;
    if (!fn) {
        throw new Error("Missing submitSellerOfferPrice function");
    }
    return fn;
}
