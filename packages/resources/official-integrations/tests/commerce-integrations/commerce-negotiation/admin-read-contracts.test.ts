import { afterAll, beforeAll, describe, expect, test } from "bun:test";

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const functionUrl = "https://project.supabase.co/functions/v1/cms-commerce-negotiation";
const apiKey = "negotiation-admin-contract-key";
const realDeno = (globalThis as { Deno?: unknown }).Deno;
const realFetch = globalThis.fetch;
const requests: Request[] = [];
let handler: EdgeHandler;

const rawProposal = {
    id: 9,
    public_id: "proposal-public-9",
    commerce_offer_id: 43,
    commerce_offer_slug: "admin-racket",
    commerce_offer_title: "Admin racket",
    seller_cms_user_id: "seller-9",
    seller_display_name: "Seller Nine",
    buyer_cms_user_id: "buyer-9",
    reference_amount: 20_000,
    minimum_amount: 16_000,
    maximum_amount: 24_000,
    proposed_amount: 19_000,
    currency: "eur",
    buyer_message: null,
    decision_message: "Manual review",
    status: "pending",
    version: 4,
    expires_at: "2026-07-21T12:00:00Z",
    accepted_at: null,
    rejected_at: null,
    withdrawn_at: null,
    created_at: "2026-07-18T12:00:00Z",
    updated_at: "2026-07-18T13:00:00Z",
};
const publicProposal = {
    id: 9,
    publicId: "proposal-public-9",
    offerId: 43,
    offerSlug: "admin-racket",
    offerTitle: "Admin racket",
    offerMainImageMediaId: null,
    offerMainImageWidth: null,
    offerMainImageHeight: null,
    sellerUserId: "seller-9",
    sellerDisplayName: "Seller Nine",
    buyerUserId: "buyer-9",
    viewerRole: "admin",
    referenceAmount: 20_000,
    minimumAmount: 16_000,
    maximumAmount: 24_000,
    proposedAmount: 19_000,
    currency: "eur",
    buyerMessage: null,
    decisionMessage: "Manual review",
    status: "pending",
    version: 4,
    expiresAt: "2026-07-21T12:00:00Z",
    acceptedAt: null,
    agreementId: null,
    agreementVersion: null,
    checkoutExpiresAt: null,
    checkoutStatus: null,
    orderId: null,
    consumedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    createdAt: "2026-07-18T12:00:00Z",
    updatedAt: "2026-07-18T13:00:00Z",
};
const rawEvent = {
    id: 19,
    event_type: "created",
    actor_kind: "buyer",
    actor_id: "buyer-9",
    previous_status: null,
    next_status: "pending",
    data: { amount: 19_000 },
    created_at: "2026-07-18T12:00:00Z",
};

beforeAll(async () => {
    (globalThis as { Deno?: unknown }).Deno = {
        env: {
            get: (name: string) =>
                ({
                    CMS_NEGOTIATION_API_KEY: apiKey,
                    SUPABASE_URL: "https://project.supabase.co",
                    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
                })[name],
        },
        serve(value: EdgeHandler) {
            handler = value;
            return {
                shutdown() {
                    /* test stub */
                },
            };
        },
    };
    globalThis.fetch = captureDatabaseRequest;
    await import(
        "../../../integrations/extensions/commerce-negotiation/versions/1.0.0/connectors/supabase/functions/cms-commerce-negotiation/index.ts?admin-read-contracts"
    );
});

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("commerce negotiation admin read contracts", () => {
    test("preserves search, pagination, detail events, and API-key denial", async () => {
        requests.length = 0;
        const headers = { authorization: `Bearer ${apiKey}` };
        const list = await handler(
            new Request(`${functionUrl}/admin/proposals?q=racket&status=pending&limit=1&offset=2`, { headers }),
        );
        expect(list.status).toBe(200);
        expect(await list.json()).toEqual({ items: [publicProposal], total: 1 });
        expect(databasePaths()).toEqual(["/rest/v1/rpc/list_admin_proposals"]);
        expect(await requests[0]!.json()).toEqual({
            p_query: "racket",
            p_status: "pending",
            p_limit: 1,
            p_offset: 2,
        });

        requests.length = 0;
        const detail = await handler(
            new Request(`${functionUrl}/admin/proposal?publicId=proposal-public-9`, { headers }),
        );
        expect(detail.status).toBe(200);
        expect(await detail.json()).toEqual({
            ...publicProposal,
            events: [
                {
                    id: 19,
                    eventType: "created",
                    actorKind: "buyer",
                    actorId: "buyer-9",
                    previousStatus: null,
                    nextStatus: "pending",
                    data: { amount: 19_000 },
                    createdAt: "2026-07-18T12:00:00Z",
                },
            ],
        });
        expect(databasePaths()).toEqual(["/rest/v1/rpc/get_admin_proposal_detail"]);
        expect(await requests[0]!.json()).toEqual({
            p_id: null,
            p_public_id: "proposal-public-9",
        });

        requests.length = 0;
        const denied = await handler(
            new Request(`${functionUrl}/admin/proposals`, {
                headers: { authorization: "Bearer wrong-key" },
            }),
        );
        expect(denied.status).toBe(401);
        expect(await denied.json()).toEqual({ error: "invalid CMS API key" });
        expect(requests).toEqual([]);
    });

    test("returns a 400 response instead of rejecting an invalid settings update", async () => {
        requests.length = 0;
        const outcome = await Promise.resolve(
            handler(
                new Request(`${functionUrl}/admin/settings`, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({}),
                }),
            ),
        ).then(
            async (response) => ({
                kind: "response" as const,
                status: response.status,
                body: await response.json(),
            }),
            (error: unknown) => ({
                kind: "rejection" as const,
                message: error instanceof Error ? error.message : String(error),
            }),
        );

        expect(outcome).toEqual({
            kind: "response",
            status: 400,
            body: { error: "expectedVersion must be an integer" },
        });
        expect(requests).toEqual([]);
    });

    test("converts an asynchronous settings read failure into an HTTP response", async () => {
        requests.length = 0;
        const response = await handler(
            new Request(`${functionUrl}/admin/settings`, {
                headers: { authorization: `Bearer ${apiKey}` },
            }),
        );

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "settings read failed" });
        expect(databasePaths()).toEqual(["/rest/v1/settings"]);
    });
});

const captureDatabaseRequest = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (path.endsWith("/rpc/list_admin_proposals")) {
        return Response.json({ items: [rawProposal], total: 1 });
    }
    if (path.endsWith("/rpc/get_admin_proposal_detail")) {
        return Response.json({ proposal: rawProposal, events: [rawEvent] });
    }
    if (path.endsWith("/settings")) {
        return Response.json({ message: "settings read failed" }, { status: 503 });
    }
    return Response.json({ message: "not found" }, { status: 404 });
}) as typeof fetch;

function databasePaths(): string[] {
    return requests.map((request) => new URL(request.url).pathname);
}
