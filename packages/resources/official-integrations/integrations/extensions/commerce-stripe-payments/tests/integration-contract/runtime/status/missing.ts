import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertMissingPaymentRefresh(
    { refreshFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    let missingPaymentProjected = false;
    const missingPaymentRefresh = await executeFunction(
        refreshFn,
        new Request("https://cms.test/functions/refreshPaymentForOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: 42 }),
        }),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input) => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://commerce.test/payment/record")) {
                        missingPaymentProjected = true;
                        return Response.json({});
                    }
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    return Response.json({ exists: false });
                },
            },
        },
    );
    expect(missingPaymentRefresh.status).toBe(404);
    expect(await missingPaymentRefresh.json()).toEqual({
        error: "Payment does not exist for this order",
    });
    expect(missingPaymentProjected).toBeFalse();
}
