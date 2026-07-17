import {
    negotiationContext,
    offer,
    policy,
    proposal,
    seller,
} from "./expected";

type FailurePoint = "offer" | "seller" | "negotiation";

export function successfulResponder(request: Request): Response {
    const path = new URL(request.url).pathname;
    if (path === "/admin/offer") return Response.json(offer);
    if (path === "/admin/seller") return Response.json(seller);
    if (path === "/system/offer/negotiation-context") {
        return Response.json(negotiationContext);
    }
    if (path === "/policy") return Response.json(policy);
    if (path === "/proposals") return Response.json(proposal, { status: 201 });
    throw new Error(`Unexpected workflow call: ${request.url}`);
}

export function failingResponder(point: FailurePoint) {
    return (request: Request): Response => {
        const path = new URL(request.url).pathname;
        if (
            point === "offer"
            && (path === "/admin/offer" || path === "/system/offer/negotiation-context")
        ) {
            return Response.json({ error: "offer not found" }, { status: 404 });
        }
        if (point === "seller" && path === "/admin/seller") {
            return Response.json({ error: "seller not found" }, { status: 404 });
        }
        if (
            point === "seller"
            && path === "/system/offer/negotiation-context"
        ) {
            return Response.json({ error: "seller not found" }, { status: 404 });
        }
        if (point === "negotiation" && (path === "/policy" || path === "/proposals")) {
            return Response.json(
                { error: "proposal policy unavailable", detail: "internal-row-7" },
                { status: 409 },
            );
        }
        return successfulResponder(request);
    };
}
