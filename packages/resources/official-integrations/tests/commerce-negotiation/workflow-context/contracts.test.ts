import { describe, expect, test } from "bun:test";
import { executeNegotiationWorkflow } from "./harness";
import {
    negotiationContext,
    policy,
    proposal,
} from "./expected";
import { successfulResponder } from "./responders";

describe("Commerce negotiation workflow contracts", () => {
    test("returns the exact proposal policy from the authoritative offer snapshot", async () => {
        const { response, calls } = await executeNegotiationWorkflow(
            "getProposalPolicy",
            new Request(
                "https://cms.test/functions/getProposalPolicy?offerId=42",
            ),
            successfulResponder,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(policy);
        const downstream = calls.at(-1)!;
        expect(downstream.url.pathname).toBe("/policy");
        expect(Object.fromEntries(downstream.url.searchParams)).toEqual(
            Object.fromEntries(Object.entries(negotiationContext).map(
                ([key, value]) => [key, String(value)],
            )),
        );
        expect(downstream.headers.get("x-cms-user-id")).toBe("buyer-user");
    });

    test("returns the exact created proposal and forwards only current offer fields", async () => {
        const { response, calls } = await executeNegotiationWorkflow(
            "createMyProposal",
            new Request("https://cms.test/functions/createMyProposal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    offerId: 42,
                    amount: 9_500,
                    message: "Could you accept this price?",
                }),
            }),
            successfulResponder,
        );

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual(proposal);
        const downstream = calls.at(-1)!;
        expect(downstream.url.pathname).toBe("/proposals");
        expect(downstream.method).toBe("POST");
        expect(downstream.body).toEqual({
            offerId: 42,
            amount: 9_500,
            message: "Could you accept this price?",
            ...negotiationContext,
        });
        expect(downstream.headers.get("x-cms-user-id")).toBe("buyer-user");
    });

    test("preserves an omitted buyer message and explicit response nulls", async () => {
        const expected = { ...proposal, buyerMessage: null };
        const { response, calls } = await executeNegotiationWorkflow(
            "createMyProposal",
            new Request("https://cms.test/functions/createMyProposal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ offerId: 42, amount: 9_500 }),
            }),
            request => new URL(request.url).pathname === "/proposals"
                ? Response.json(expected, { status: 201 })
                : successfulResponder(request),
        );

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual(expected);
        expect(calls.at(-1)?.body).toEqual({
            offerId: 42,
            amount: 9_500,
            ...negotiationContext,
        });
    });
});
