import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

const currentVersionId = "018f72b8-1f90-7c31-a933-592c90c8178a";
const staleVersionId = "018f72b8-1f90-7c31-a933-592c90c81780";

export async function assertBuyerLegalContracts(
    context: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    await assertRequirements(context, identities);
    await assertUnavailableRequirements(context, identities);
    await assertPaymentBlocked(context, identities, undefined, 422, "BUYER_LEGAL_ACCEPTANCE_REQUIRED");
    await assertPaymentBlocked(context, identities, [staleVersionId], 409, "LEGAL_DOCUMENT_VERSION_CHANGED");
}

async function assertRequirements(
    { legalFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const response = await executeFunction(
        legalFn,
        new Request("https://cms.test/functions/getPaymentLegalRequirements?orderId=42"),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    expect(request.url).toBe("https://commerce.test/buyer-legal/requirements?orderId=42");
                    expect(request.headers.get("x-cms-user-id")).toBe("buyer-subject");
                    return Response.json({
                        enabled: true,
                        documents: [
                            {
                                key: "terms",
                                label: "Conditions générales de vente",
                                consentText: "J’accepte les conditions générales de vente.",
                                pageUrl: "/cgu-cgv",
                                versionId: currentVersionId,
                                versionDate: "2026-07-24T12:00:00.000Z",
                            },
                        ],
                    });
                },
            },
        },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        enabled: true,
        documents: [{ key: "terms", versionId: currentVersionId }],
    });
}

async function assertUnavailableRequirements(
    { legalFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const response = await executeFunction(
        legalFn,
        new Request("https://cms.test/functions/getPaymentLegalRequirements?orderId=42"),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async () => Response.json({ error: "LEGAL_DOCUMENT_NOT_AVAILABLE" }, { status: 409 }),
            },
        },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_NOT_AVAILABLE" });
}

async function assertPaymentBlocked(
    { fn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    acceptedVersionIds: string[] | undefined,
    expectedStatus: number,
    expectedError: string,
): Promise<void> {
    let providerCalled = false;
    const body = {
        orderId: 42,
        ...(acceptedVersionIds ? { acceptedLegalDocumentVersionIds: acceptedVersionIds } : {}),
    };
    const response = await executeFunction(fn, jsonRequest(fn, body), {
        sources,
        identities,
        user: { id: "buyer-subject", role: "user" },
        deps: {
            identities,
            fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                    const requestBody = (await request.json()) as Record<string, unknown>;
                    expect(requestBody.orderId).toBe(42);
                    expect(requestBody.paymentProvider).toBe("stripe");
                    expect(requestBody.acceptedLegalDocumentVersionIds).toEqual(acceptedVersionIds);
                    return Response.json({ error: expectedError }, { status: expectedStatus });
                }
                providerCalled = true;
                return Response.json({ error: "provider must not be called" }, { status: 500 });
            },
        },
    });
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ error: expectedError });
    expect(providerCalled).toBeFalse();
}

function jsonRequest(fn: CmsFunction, body: unknown): Request {
    return new Request(`https://cms.test/functions/${fn.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
