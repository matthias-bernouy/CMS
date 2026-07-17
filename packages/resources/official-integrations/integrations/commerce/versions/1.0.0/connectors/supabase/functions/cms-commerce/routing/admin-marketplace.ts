import { methodNotAllowed } from "../core/http.ts";
import { requireCmsAdmin } from "../core/auth.ts";
import { getOffer, listOffers, reviewOffer, upsertOffer } from "../routes/offers.ts";
import { getOfferImageFile, removeOfferImage, reorderOfferImages, replaceOfferImage, uploadOfferImage } from "../routes/offer/media.ts";
import { getOrder } from "../routes/orders.ts";
import { listAdminOrders } from "../routes/order/read-model/lists.ts";
import { reviewOrderCancellation } from "../routes/order/cancellations.ts";
import { getClaim, getClaimEvidenceMetadata, listClaimEvidence, listClaims, resolveOrderClaim } from "../routes/order/claims.ts";
import { getClaimEvidenceFile } from "../routes/order/claim-evidence.ts";
import { getProtectedPayment, listCommerceExceptions, listProtectedPayments } from "../routes/order/read-model/operations.ts";
import { getRefundRequest, listRefundRequests, requestOrderRefund, reviewOrderRefund } from "../routes/order/refunds.ts";
import { authorizeOrderRelease } from "../routes/order/settlements.ts";
import { authorizePlatformPayoutLiabilityDecrease } from "../routes/order/financials.ts";
import { recoverOrderShipmentCreation } from "../routes/order/fulfillment.ts";
import { getSeller, listSellers, reviewSeller } from "../routes/sellers.ts";

export async function handleAdminMarketplaceRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/admin/sellers") {
        return request.method === "GET" ? await listSellers(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/seller") {
        return request.method === "GET" ? await getSeller(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/seller/review") {
        return request.method === "POST" ? await reviewSeller(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/offers") {
        return request.method === "GET" ? await listOffers(request, "admin") : methodNotAllowed("GET");
    }
    if (route === "/admin/offer") {
        if (request.method === "GET") return await getOffer(request, "admin");
        if (request.method === "POST") return await upsertOffer(request);
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/admin/offer/review") {
        return request.method === "POST" ? await reviewOffer(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/offer/image") {
        if (request.method === "GET") return await getOfferImageFile(request, "admin");
        if (request.method === "POST") return await uploadOfferImage(request, "admin");
        if (request.method === "DELETE") return await removeOfferImage(request, "admin");
        return methodNotAllowed("GET", "POST", "DELETE");
    }
    if (route === "/admin/offer/image/replace") {
        return request.method === "POST" ? await replaceOfferImage(request, "admin") : methodNotAllowed("POST");
    }
    if (route === "/admin/offer/images/reorder") {
        return request.method === "POST" ? await reorderOfferImages(request, "admin") : methodNotAllowed("POST");
    }
    if (route === "/admin/orders") {
        return request.method === "GET" ? await listAdminOrders(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/order") {
        return request.method === "GET" ? await getOrder(request, false) : methodNotAllowed("GET");
    }
    if (route === "/admin/protected-payments") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await listProtectedPayments(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/protected-payment") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await getProtectedPayment(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/claims") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await listClaims(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/claim") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await getClaim(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/claim/evidence") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await getClaimEvidenceFile(request, "admin") : methodNotAllowed("GET");
    }
    if (route === "/admin/claim/evidence-items") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await listClaimEvidence(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/claim/evidence-item") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await getClaimEvidenceMetadata(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/claim/resolve") {
        requireCmsAdmin(request);
        return request.method === "POST" ? await resolveOrderClaim(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/refund-requests") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await listRefundRequests(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/refund-request") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await getRefundRequest(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/order/refund") {
        requireCmsAdmin(request);
        return request.method === "POST" ? await requestOrderRefund(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/refund/review") {
        requireCmsAdmin(request);
        return request.method === "POST" ? await reviewOrderRefund(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/order/release") {
        requireCmsAdmin(request);
        return request.method === "POST" ? await authorizeOrderRelease(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/platform-payout-liability/authorize-decrease") {
        requireCmsAdmin(request);
        return request.method === "POST"
            ? await authorizePlatformPayoutLiabilityDecrease(request)
            : methodNotAllowed("POST");
    }
    if (route === "/admin/order/cancellation/review") {
        requireCmsAdmin(request);
        return request.method === "POST" ? await reviewOrderCancellation(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/order/shipment-creation/recover") {
        requireCmsAdmin(request);
        return request.method === "POST" ? await recoverOrderShipmentCreation(request) : methodNotAllowed("POST");
    }
    if (route === "/admin/commerce-exceptions") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await listCommerceExceptions(request) : methodNotAllowed("GET");
    }
    return null;
}
