import { describe, expect, test } from "bun:test";
import { executeNegotiationWorkflow, loadNegotiationFunction } from "./harness";
import { failingResponder, successfulResponder } from "./responders";
import { negotiationContext, offer, seller } from "./expected";

describe("Commerce negotiation workflow boundaries", () => {
    test("keeps authenticated access and rejects invalid inputs before source work", async () => {
        expect((await loadNegotiationFunction("getProposalPolicy")).access).toEqual({ mode: "auth" });
        expect((await loadNegotiationFunction("createMyProposal")).access).toEqual({ mode: "auth" });
        const invalid = await executeNegotiationWorkflow(
            "createMyProposal",
            new Request("https://cms.test/functions/createMyProposal", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ offerId: 42 }),
            }),
            successfulResponder,
        );
        expect(invalid.response.status).toBe(400);
        expect(await invalid.response.json()).toEqual({
            error: "body.amount is required",
        });
        expect(invalid.calls).toEqual([]);
    });

    for (const field of ["referenceAmount", "sellerCmsUserId"] as const) {
        test(`fails before Negotiation when ${field} is null`, async () => {
            const { response, calls } = await executeNegotiationWorkflow(
                "getProposalPolicy",
                new Request("https://cms.test/functions/getProposalPolicy?offerId=42"),
                (request) => {
                    const path = new URL(request.url).pathname;
                    if (path === "/admin/offer") {
                        return Response.json(
                            field === "referenceAmount" ? { ...offer, acceptedPriceAmount: null } : offer,
                        );
                    }
                    if (path === "/admin/seller") {
                        return Response.json(field === "sellerCmsUserId" ? { ...seller, cmsUserId: null } : seller);
                    }
                    if (path === "/system/offer/negotiation-context") {
                        return Response.json({
                            ...negotiationContext,
                            [field]: null,
                        });
                    }
                    return successfulResponder(request);
                },
            );

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "Function execution failed",
                correlationId: expect.any(String),
            });
            expect(calls.some((call) => call.url.pathname === "/policy")).toBe(false);
        });
    }

    for (const point of ["offer", "seller", "negotiation"] as const) {
        test(`fails safely when the ${point} boundary refuses`, async () => {
            const { response, calls } = await executeNegotiationWorkflow(
                "getProposalPolicy",
                new Request("https://cms.test/functions/getProposalPolicy?offerId=42"),
                failingResponder(point),
            );

            expect(response.status).toBe(502);
            const body = (await response.json()) as Record<string, unknown>;
            expect(body).toEqual({
                error: "Function execution failed",
                correlationId: expect.any(String),
            });
            expect(JSON.stringify(body)).not.toContain("internal-row-7");
            expect(calls.some((call) => call.url.pathname === "/policy")).toBe(point === "negotiation");
        });
    }

    for (const field of ["referenceAmount", "sellerCmsUserId"] as const) {
        test(`does not create a proposal when ${field} is null`, async () => {
            const { response, calls } = await executeNegotiationWorkflow(
                "createMyProposal",
                new Request("https://cms.test/functions/createMyProposal", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ offerId: 42, amount: 9_500 }),
                }),
                async (request) => {
                    const path = new URL(request.url).pathname;
                    if (path === "/admin/offer") {
                        return Response.json(
                            field === "referenceAmount" ? { ...offer, acceptedPriceAmount: null } : offer,
                        );
                    }
                    if (path === "/admin/seller") {
                        return Response.json(field === "sellerCmsUserId" ? { ...seller, cmsUserId: null } : seller);
                    }
                    if (path === "/system/offer/negotiation-context") {
                        return Response.json({
                            ...negotiationContext,
                            [field]: null,
                        });
                    }
                    if (path === "/proposals") {
                        const body = (await request.clone().json()) as Record<string, unknown>;
                        if (body[field] === null) {
                            return Response.json({ error: `${field} is required` }, { status: 400 });
                        }
                    }
                    return successfulResponder(request);
                },
            );

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "Function execution failed",
                correlationId: expect.any(String),
            });
            expect(calls.some((call) => call.url.pathname === "/proposals")).toBe(field === "sellerCmsUserId");
        });
    }

    for (const point of ["offer", "seller", "negotiation"] as const) {
        test(`does not continue proposal creation after ${point} refuses`, async () => {
            const { response, calls } = await executeNegotiationWorkflow(
                "createMyProposal",
                new Request("https://cms.test/functions/createMyProposal", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ offerId: 42, amount: 9_500 }),
                }),
                failingResponder(point),
            );

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "Function execution failed",
                correlationId: expect.any(String),
            });
            expect(calls.some((call) => call.url.pathname === "/proposals")).toBe(point === "negotiation");
        });
    }
});
