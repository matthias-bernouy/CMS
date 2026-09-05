import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";
import { connectStatus } from "../../sources/index";

export async function assertSellerCapabilityRefresh(
    { capabilityRefreshFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const recorded: unknown[] = [];
    const execute = (status: Record<string, unknown>, stripeStatus = 200) =>
        executeFunction(capabilityRefreshFn, request(), {
            sources,
            identities,
            user: { id: "seller-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const sourceRequest = new Request(input, init);
                    if (sourceRequest.url.startsWith("https://stripe.test/status")) {
                        return Response.json(status, { status: stripeStatus });
                    }
                    if (sourceRequest.url.startsWith("https://commerce.test/seller/sale-capability")) {
                        recorded.push(await sourceRequest.json());
                        return Response.json({
                            sellerId: 184,
                            capabilityKey: "protected_payment",
                            ready: status.canAcceptHeldPayments === true,
                            confirmedAt: status.canAcceptHeldPayments === true ? "2026-07-13T12:00:00.000Z" : null,
                            revokedAt: status.canAcceptHeldPayments === true ? null : "2026-07-13T12:00:00.000Z",
                        });
                    }
                    throw new Error(`unexpected capability refresh call: ${sourceRequest.url}`);
                },
            },
        });

    const ready = connectStatus({ enrolled: true, currentTermsAccepted: true });
    const first = await execute(ready);
    const second = await execute(ready);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
        connect: { canAcceptHeldPayments: true },
        capability: { capabilityKey: "protected_payment", ready: true },
    });
    expect(recorded).toEqual([capabilityBody(true, "enrolled"), capabilityBody(true, "enrolled")]);

    const incomplete = await execute(connectStatus({ enrolled: true, currentTermsAccepted: false }));
    expect(incomplete.status).toBe(200);
    expect(await incomplete.json()).toMatchObject({ capability: { ready: false } });
    expect(recorded.at(-1)).toEqual(capabilityBody(false, "terms_required"));

    const beforeUnavailable = recorded.length;
    const unavailable = await execute({ error: "provider unavailable" }, 503);
    expect(unavailable.status).not.toBe(200);
    expect(recorded).toHaveLength(beforeUnavailable);
}

function capabilityBody(ready: boolean, evidenceReference: string): Record<string, unknown> {
    return {
        sellerCmsUserId: "seller-subject",
        capabilityKey: "protected_payment",
        ready,
        evidenceReference,
    };
}

function request(): Request {
    return new Request("https://cms.test/functions/refreshMyProtectedPaymentCapability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
    });
}
