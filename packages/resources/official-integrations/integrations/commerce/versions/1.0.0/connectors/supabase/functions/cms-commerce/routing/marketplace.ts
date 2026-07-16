import { methodNotAllowed } from "../core/http.ts";
import {
    checkoutCart,
    clearCart,
    getCart,
    removeCartItem,
    upsertCartItem,
} from "../routes/cart/index.ts";
import { listOfferConditions } from "../routes/offer-workflow.ts";
import {
    createMyOffer,
    getOffer,
    listOffers,
    submitMyOffer,
    submitMyOfferPrice,
    updateMyOffer,
} from "../routes/offers.ts";
import { getOfferImageFile, removeOfferImage, reorderOfferImages, replaceOfferImage, uploadOfferImage } from "../routes/offer/media.ts";
import { estimateOfferPrice } from "../routes/offer/estimate.ts";
import { createOrder, getOrder, listOrders } from "../routes/orders.ts";
import { cancelMyOrder, cancelMySale } from "../routes/order/cancellations.ts";
import { openMyOrderClaim, respondToMySaleClaim } from "../routes/order/claims.ts";
import { getClaimEvidenceFile, uploadMyClaimEvidence } from "../routes/order/claim-evidence.ts";
import { prepareProtectedPayment } from "../routes/order/financials.ts";
import { getMySale, listMySales } from "../routes/order/sales.ts";
import { getMySeller, registerMySeller, updateMySeller } from "../routes/sellers.ts";

export async function handleMarketplaceRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/offers") {
        return request.method === "GET" ? await listOffers(request, "public") : methodNotAllowed("GET");
    }
    if (route === "/offer") {
        return request.method === "GET" ? await getOffer(request, "public") : methodNotAllowed("GET");
    }
    if (route === "/offer/image") {
        return request.method === "GET" ? await getOfferImageFile(request, "public") : methodNotAllowed("GET");
    }
    if (route === "/offer-conditions") {
        return request.method === "GET" ? await listOfferConditions() : methodNotAllowed("GET");
    }
    if (route === "/offer-estimate") {
        return request.method === "GET" ? await estimateOfferPrice(request) : methodNotAllowed("GET");
    }
    if (route === "/me/seller") {
        if (request.method === "GET") return await getMySeller(request);
        if (request.method === "POST") return await registerMySeller(request);
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/me/seller/update") {
        return request.method === "POST" ? await updateMySeller(request) : methodNotAllowed("POST");
    }
    if (route === "/me/offers") {
        if (request.method === "GET") return await listOffers(request, "self");
        if (request.method === "POST") return await createMyOffer(request);
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/me/offer") {
        if (request.method === "GET") return await getOffer(request, "self");
        if (request.method === "POST") return await updateMyOffer(request);
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/me/offer/submit") {
        return request.method === "POST" ? await submitMyOffer(request) : methodNotAllowed("POST");
    }
    if (route === "/me/offer/price") {
        return request.method === "POST" ? await submitMyOfferPrice(request) : methodNotAllowed("POST");
    }
    if (route === "/me/offer/image") {
        if (request.method === "GET") return await getOfferImageFile(request, "self");
        if (request.method === "POST") return await uploadOfferImage(request, "self");
        if (request.method === "DELETE") return await removeOfferImage(request, "self");
        return methodNotAllowed("GET", "POST", "DELETE");
    }
    if (route === "/me/offer/image/replace") {
        return request.method === "POST" ? await replaceOfferImage(request, "self") : methodNotAllowed("POST");
    }
    if (route === "/me/offer/images/reorder") {
        return request.method === "POST" ? await reorderOfferImages(request, "self") : methodNotAllowed("POST");
    }
    if (route === "/me/cart") {
        return request.method === "GET" ? await getCart(request) : methodNotAllowed("GET");
    }
    if (route === "/me/cart/item") {
        if (request.method === "POST") return await upsertCartItem(request);
        if (request.method === "DELETE") return await removeCartItem(request);
        return methodNotAllowed("POST", "DELETE");
    }
    if (route === "/me/cart/clear") {
        return request.method === "POST" ? await clearCart(request) : methodNotAllowed("POST");
    }
    if (route === "/me/cart/checkout") {
        return request.method === "POST" ? await checkoutCart(request) : methodNotAllowed("POST");
    }
    if (route === "/me/orders") {
        if (request.method === "GET") return await listOrders(request, true);
        if (request.method === "POST") return await createOrder(request);
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/me/order") {
        return request.method === "GET" ? await getOrder(request, true) : methodNotAllowed("GET");
    }
    if (route === "/me/sales") {
        return request.method === "GET" ? await listMySales(request) : methodNotAllowed("GET");
    }
    if (route === "/me/sale") {
        return request.method === "GET" ? await getMySale(request) : methodNotAllowed("GET");
    }
    if (route === "/me/order/payment/prepare") {
        return request.method === "POST" ? await prepareProtectedPayment(request) : methodNotAllowed("POST");
    }
    if (route === "/me/order/claim") {
        return request.method === "POST" ? await openMyOrderClaim(request) : methodNotAllowed("POST");
    }
    if (route === "/me/order/claim/evidence") {
        if (request.method === "POST") return await uploadMyClaimEvidence(request, "buyer");
        if (request.method === "GET") return await getClaimEvidenceFile(request, "buyer");
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/me/sale/claim/respond") {
        return request.method === "POST" ? await respondToMySaleClaim(request) : methodNotAllowed("POST");
    }
    if (route === "/me/sale/claim/evidence") {
        if (request.method === "POST") return await uploadMyClaimEvidence(request, "seller");
        if (request.method === "GET") return await getClaimEvidenceFile(request, "seller");
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/me/order/cancel") {
        return request.method === "POST" ? await cancelMyOrder(request) : methodNotAllowed("POST");
    }
    if (route === "/me/sale/cancel") {
        return request.method === "POST" ? await cancelMySale(request) : methodNotAllowed("POST");
    }
    return null;
}
