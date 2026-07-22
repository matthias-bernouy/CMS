import { afterAll, beforeAll, describe, expect, test } from "bun:test";

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const functionUrl = "https://project.supabase.co/functions/v1/cms-commerce-negotiation";
const apiKey = "negotiation-contract-key";
const realDeno = (globalThis as { Deno?: unknown }).Deno;
const realFetch = globalThis.fetch;
const requests: Request[] = [];
let handler: EdgeHandler;

const proposal = {
    id: 7,
    public_id: "proposal-public-7",
    commerce_offer_id: 42,
    commerce_offer_slug: "smoke-racket",
    commerce_offer_title: "Smoke racket",
    seller_cms_user_id: "seller-user",
    seller_display_name: "Seller",
    buyer_cms_user_id: "buyer-user",
    reference_amount: 10_000,
    minimum_amount: 8_000,
    maximum_amount: 12_000,
    proposed_amount: 9_500,
    currency: "eur",
    buyer_message: "Could you accept this price?",
    decision_message: null,
    status: "pending",
    version: 3,
    expires_at: "2026-07-20T12:00:00Z",
    accepted_at: null,
    rejected_at: null,
    withdrawn_at: null,
    created_at: "2026-07-17T12:00:00Z",
    updated_at: "2026-07-17T13:00:00Z",
};

const expectedProposal = {
    id: 7,
    publicId: "proposal-public-7",
    offerId: 42,
    offerSlug: "smoke-racket",
    offerTitle: "Smoke racket",
    sellerUserId: "seller-user",
    sellerDisplayName: "Seller",
    buyerUserId: "buyer-user",
    viewerRole: "buyer",
    referenceAmount: 10_000,
    minimumAmount: 8_000,
    maximumAmount: 12_000,
    proposedAmount: 9_500,
    currency: "eur",
    buyerMessage: "Could you accept this price?",
    decisionMessage: null,
    status: "pending",
    version: 3,
    expiresAt: "2026-07-20T12:00:00Z",
    acceptedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    createdAt: "2026-07-17T12:00:00Z",
    updatedAt: "2026-07-17T13:00:00Z",
};
const proposalEvent = {
    id: 11,
    event_type: "created",
    actor_kind: "buyer",
    actor_id: "buyer-user",
    previous_status: null,
    next_status: "pending",
    data: { amount: 9_500 },
    created_at: "2026-07-17T12:00:00Z",
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
        "../../../integrations/extensions/commerce-negotiation/versions/1.0.0/connectors/supabase/functions/cms-commerce-negotiation/index.ts?read-contracts"
    );
});

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("commerce negotiation read contracts", () => {
    test("preserves participant list, detail, pagination, expiry, and denial contracts", async () => {
        requests.length = 0;
        const headers = { authorization: `Bearer ${apiKey}`, "x-cms-user-id": "buyer-user" };
        const list = await handler(
            new Request(`${functionUrl}/proposals?role=buyer&status=pending&offerId=42&limit=1&offset=2`, { headers }),
        );

        expect(list.status).toBe(200);
        expect(await list.json()).toEqual({ items: [expectedProposal], total: 1 });
        expect(databasePaths()).toEqual(["/rest/v1/rpc/list_participant_proposals"]);
        expect(await requests[0]!.json()).toEqual({
            p_user_id: "buyer-user",
            p_role: "buyer",
            p_status: "pending",
            p_offer_id: 42,
            p_limit: 1,
            p_offset: 2,
        });

        requests.length = 0;
        const detail = await handler(new Request(`${functionUrl}/proposal?publicId=proposal-public-7`, { headers }));
        expect(detail.status).toBe(200);
        expect(await detail.json()).toEqual({
            ...expectedProposal,
            events: [
                {
                    id: 11,
                    eventType: "created",
                    actorKind: "buyer",
                    actorId: "buyer-user",
                    previousStatus: null,
                    nextStatus: "pending",
                    data: { amount: 9_500 },
                    createdAt: "2026-07-17T12:00:00Z",
                },
            ],
        });
        expect(databasePaths()).toEqual(["/rest/v1/rpc/get_participant_proposal_detail"]);
        expect(await requests[0]!.json()).toEqual({
            p_user_id: "buyer-user",
            p_id: null,
            p_public_id: "proposal-public-7",
        });

        requests.length = 0;
        const denied = await handler(
            new Request(`${functionUrl}/proposal?publicId=proposal-public-7`, {
                headers: { ...headers, "x-cms-user-id": "other-user" },
            }),
        );
        expect(denied.status).toBe(404);
        expect(await denied.json()).toEqual({ error: "proposal not found" });
        expect(databasePaths()).toEqual(["/rest/v1/rpc/get_participant_proposal_detail"]);

        requests.length = 0;
        await expect(
            handler(
                new Request(`${functionUrl}/proposals`, {
                    headers: { authorization: `Bearer ${apiKey}` },
                }),
            ),
        ).rejects.toMatchObject({ status: 401, message: "CMS user identity required" });
        expect(requests).toEqual([]);
    });
});

const captureDatabaseRequest = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? ((await request.json()) as Record<string, unknown>) : {};
    if (path.endsWith("/rpc/list_participant_proposals")) {
        return Response.json({ items: [proposal], total: 1 });
    }
    if (path.endsWith("/rpc/get_participant_proposal_detail")) {
        return Response.json(body.p_user_id === "buyer-user" ? { proposal, events: [proposalEvent] } : null);
    }
    return Response.json({ message: "not found" }, { status: 404 });
}) as typeof fetch;

function databasePaths(): string[] {
    return requests.map((request) => new URL(request.url).pathname);
}
