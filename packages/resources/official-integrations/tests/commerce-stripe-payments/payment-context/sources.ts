import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

const openObject = { type: "object" } as const;
const cmsUserHeader = {
    name: "x-cms-user-id",
    source: { from: "computed", ref: "userID" },
} as const;
const stripeUserHeader = {
    name: "x-user-id",
    source: { from: "computed", ref: "userID" },
} as const;

export async function paymentSources(): Promise<InMemorySourceRepository> {
    const sources = new InMemorySourceRepository();
    await sources.createSource(source("commerce", [
        get("commerce", "myOrder", "https://commerce.test/me/order", [
            { name: "id", type: "number", required: false },
        ], { mode: "auth" }, [cmsUserHeader]),
        get(
            "commerce",
            "getPaymentOrderContext",
            "https://commerce.test/system/order/payment-context",
            [{ name: "orderId", type: "number", required: true }],
            { mode: "system" },
            [cmsUserHeader],
        ),
        {
            urn: makeEndpointUrn("commerce", "recordOrderPayment"),
            method: "POST",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/system/order/payment",
            input: { body: openObject },
            output: [{ status: "200", body: openObject }],
        },
    ]));
    await sources.createSource(source("stripe-connect", [
        get(
            "stripe-connect",
            "getProtectedPaymentByClientReference",
            "https://stripe.test/payments/reference",
            [{ name: "clientReferenceId", type: "string", required: true }],
            { mode: "system" },
            [stripeUserHeader],
        ),
    ]));
    return sources;
}

type Param = {
    name: string;
    type: "number" | "string";
    required: boolean;
};

function source(id: string, endpoints: SourceEndpoint[]): Source {
    return {
        urn: makeSourceUrn(id),
        meta: { name: id },
        endpoints,
    };
}

function get(
    sourceId: string,
    endpointId: string,
    targetUrl: string,
    params: Param[],
    access: SourceEndpoint["access"],
    headers: NonNullable<SourceEndpoint["headers"]>,
): SourceEndpoint {
    return {
        urn: makeEndpointUrn(sourceId, endpointId),
        method: "GET",
        access,
        targetUrl,
        headers,
        input: {
            params: params.map(param => ({
                name: param.name,
                in: "query",
                required: param.required,
                schema: { type: param.type },
            })),
        },
        output: [{ status: "200", body: openObject }],
    };
}
