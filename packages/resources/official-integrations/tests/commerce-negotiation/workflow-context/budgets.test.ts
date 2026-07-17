import { describe, expect, test } from "bun:test";
import { executeNegotiationWorkflow } from "./harness";
import { successfulResponder } from "./responders";

describe("Commerce negotiation workflow call budgets", () => {
    test("loads one bounded Commerce context before the policy call", async () => {
        const { response, calls } = await executeNegotiationWorkflow(
            "getProposalPolicy",
            new Request(
                "https://cms.test/functions/getProposalPolicy?offerId=42",
            ),
            successfulResponder,
        );

        expect(response.status).toBe(200);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/system/offer/negotiation-context",
            "/policy",
        ]);
    });

    test("loads the same bounded context before proposal creation", async () => {
        const { response, calls } = await executeNegotiationWorkflow(
            "createMyProposal",
            new Request("https://cms.test/functions/createMyProposal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ offerId: 42, amount: 9_500 }),
            }),
            successfulResponder,
        );

        expect(response.status).toBe(201);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/system/offer/negotiation-context",
            "/proposals",
        ]);
    });
});
