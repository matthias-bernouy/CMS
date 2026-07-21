import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { useReturnAuthorizationResponder } from "./fixtures";
import { claimId, expectedAuthorization } from "./raw";

type Endpoint = {
    endpointId: string;
    method?: string;
    access?: string;
    targetUrl?: string;
    params?: unknown[];
    headers?: unknown[];
    output?: Array<{ status?: string; body?: DataShape }>;
};

installCommerceTestEnvironment();

const definitionPath = resolve(import.meta.dir, "../../../../../integrations/commerce/versions/1.0.0/definition.json");
const route = `/system/claim/return-authorization?claimId=${claimId}`;

describe("commerce claim return authorization Source contract", () => {
    test("keeps the system endpoint and exact closed output declaration", async () => {
        const endpoint = await authorizationEndpoint();
        const shape = responseShape(endpoint);

        expect({
            method: endpoint.method,
            access: endpoint.access,
            targetUrl: endpoint.targetUrl,
            params: endpoint.params,
            headers: endpoint.headers,
        }).toEqual({
            method: "GET",
            access: "system",
            targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-commerce/system/claim/return-authorization",
            params: [
                {
                    name: "claimId",
                    in: "query",
                    type: "number",
                    required: true,
                },
            ],
            headers: [
                {
                    name: "authorization",
                    source: {
                        from: "secret",
                        ref: "{{secrets.cmsApiKey}}",
                        prefix: "Bearer ",
                    },
                },
            ],
        });
        expect(Object.keys(shape.properties ?? {})).toEqual(Object.keys(expectedAuthorization));
        expect(shape.required).toEqual([
            "allowed",
            "reason",
            "claimId",
            "claimStatus",
            "claimVersion",
            "orderId",
            "orderPublicId",
            "buyerCmsUserId",
            "sellerId",
            "sellerCmsUserId",
            "deliveryQuoteId",
            "merchandiseSubtotalMinorAmount",
            "currency",
        ]);
        expect(shape.properties?.returnShipByAt?.nullable).toBe(true);
        expect(shape.properties?.returnDeliveryStatus?.nullable).toBe(true);
    });

    test("preserves the exact strict Source projection", async () => {
        useReturnAuthorizationResponder();
        const response = await requestCommerce(route);
        const shape = responseShape(await authorizationEndpoint());

        expect(response.status).toBe(200);
        expect(projectStrictDataShape(await response.json(), shape, "response")).toEqual(expectedAuthorization);
    });

    test("records the existing missing-financial-row mismatch separately", async () => {
        useReturnAuthorizationResponder({ financialTerms: null });
        const raw = await (await requestCommerce(route)).json();
        const shape = responseShape(await authorizationEndpoint());
        const {
            deliveryQuoteId: _quote,
            merchandiseSubtotalMinorAmount: _subtotal,
            currency: _currency,
            ...withoutFinancialTerms
        } = expectedAuthorization;

        expect(() => projectStrictDataShape(raw, shape, "response")).toThrow("response.deliveryQuoteId is required");
        expect(
            projectStrictDataShape(raw, shape, "response", {
                enforceRequired: false,
            }),
        ).toEqual(withoutFinancialTerms);
    });
});

async function authorizationEndpoint(): Promise<Endpoint> {
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    const endpoint = definition.artifacts
        .find((artifact: any) => artifact.source)
        ?.source?.endpoints.find((candidate: Endpoint) => candidate.endpointId === "getClaimReturnAuthorization");
    if (!endpoint) {
        throw new Error("Missing getClaimReturnAuthorization endpoint");
    }
    return endpoint;
}

function responseShape(endpoint: Endpoint): DataShape {
    const shape = endpoint.output?.find((output) => output.status === "200")?.body;
    if (!shape) {
        throw new Error("Missing getClaimReturnAuthorization 200 shape");
    }
    return shape;
}
