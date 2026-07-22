import { jsonResponse } from "../../http";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleStripeDisputeRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response | null> {
    if (url.pathname === "/v1/disputes" && method === "GET") {
        if (mock.failProviderDisputeList) {
            mock.failProviderDisputeList = false;
            return jsonResponse({ error: { message: "simulated Stripe dispute list outage" } }, 503);
        }
        const charge = url.searchParams.get("charge");
        return jsonResponse({
            data: mock.providerDisputes.filter((dispute) => !charge || dispute.charge === charge),
            has_more: false,
        });
    }
    if (/^\/v1\/disputes\/dp_[^/]+$/.test(url.pathname) && method === "GET") {
        const disputeId = decodeURIComponent(url.pathname.slice("/v1/disputes/".length));
        const dispute = mock.providerDisputes.find((candidate) => candidate.id === disputeId);
        return dispute ? jsonResponse(dispute) : jsonResponse({ error: { message: "dispute not found" } }, 404);
    }
    if (/^\/v1\/disputes\/dp_[^/]+$/.test(url.pathname) && method === "POST") {
        const disputeId = decodeURIComponent(url.pathname.slice("/v1/disputes/".length));
        return jsonResponse({ id: disputeId, status: "under_review", evidence_details: { submission_count: 1 } });
    }
    if (/^\/v1\/disputes\/dp_[^/]+\/close$/.test(url.pathname) && method === "POST") {
        const disputeId = decodeURIComponent(url.pathname.slice("/v1/disputes/".length, -"/close".length));
        return jsonResponse({ id: disputeId, status: "lost" });
    }
    return null;
}
