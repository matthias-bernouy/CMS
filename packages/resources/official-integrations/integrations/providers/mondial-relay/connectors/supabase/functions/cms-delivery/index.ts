import { handleError, json, optionsResponse, routePath } from "./http.ts";
import { health } from "./routes/health.ts";
import {
    acknowledgeEvent,
    deliveryProjectionHealth,
    failProjectionEvent,
    projectionExceptions,
    reconcile,
    reviewProjectionException,
} from "./routes/projection.ts";
import {
    publicDeliveryQuote,
    relayPoints,
    relaySelection,
    resolveDeliveryQuote,
    saveClaimReturnRelaySelection,
    saveRelaySelection,
} from "./routes/relay/index.ts";
import { setSettings, settings } from "./routes/settings/routes.ts";
import {
    cancelShipment,
    createShipment,
    issueLabelAccess,
    label,
    recoverShipment,
    sellerHandoff,
    shipment,
    shipmentForExternalOrder,
    shipments,
    systemShipmentTrackingContext,
} from "./routes/shipments/index.ts";
import { parseTrackingLink, tracking } from "./routes/tracking.ts";

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }

        const route = routePath(request);
        if (request.method === "GET" && route === "/health") {
            return health(request);
        }
        if (request.method === "GET" && route === "/shipments") {
            return await shipments(request);
        }
        if (request.method === "GET" && route === "/shipment") {
            return await shipment(request);
        }
        if (request.method === "GET" && route === "/system/shipment-for-external-order") {
            return await shipmentForExternalOrder(request);
        }
        if (request.method === "GET" && route === "/system/shipment-tracking-context") {
            return await systemShipmentTrackingContext(request);
        }
        if (request.method === "POST" && route === "/shipments") {
            return await createShipment(request);
        }
        if (request.method === "GET" && route === "/settings") {
            return await settings(request);
        }
        if (request.method === "POST" && route === "/settings") {
            return await setSettings(request);
        }
        if (request.method === "GET" && route === "/relay-points") {
            return await relayPoints(request);
        }
        if (request.method === "GET" && route === "/relay-selection") {
            return await relaySelection(request);
        }
        if (request.method === "POST" && route === "/relay-selections") {
            return await saveRelaySelection(request);
        }
        if (request.method === "POST" && route === "/system/claim-return-relay-selections") {
            return await saveClaimReturnRelaySelection(request);
        }
        if (request.method === "POST" && route === "/system/delivery-quotes/resolve") {
            return await resolveDeliveryQuote(request);
        }
        if (request.method === "GET" && route === "/system/delivery-quotes/public") {
            return await publicDeliveryQuote(request);
        }
        if (request.method === "GET" && route === "/label") {
            return await label(request);
        }
        if (request.method === "POST" && route === "/system/label-access") {
            return await issueLabelAccess(request);
        }
        if (request.method === "POST" && route === "/system/shipments/handoff") {
            return await sellerHandoff(request);
        }
        if (request.method === "POST" && route === "/system/shipments/cancel") {
            return await cancelShipment(request);
        }
        if (request.method === "POST" && route === "/system/reconcile") {
            return await reconcile(request);
        }
        if (request.method === "POST" && route === "/system/events/ack") {
            return await acknowledgeEvent(request);
        }
        if (request.method === "POST" && route === "/system/events/fail") {
            return await failProjectionEvent(request);
        }
        if (request.method === "GET" && route === "/system/projection-health") {
            return await deliveryProjectionHealth(request);
        }
        if (request.method === "GET" && route === "/admin/projection-exceptions") {
            return await projectionExceptions(request);
        }
        if (request.method === "POST" && route === "/admin/projection-exceptions/review") {
            return await reviewProjectionException(request);
        }
        if (request.method === "POST" && route === "/admin/shipments/recover") {
            return await recoverShipment(request);
        }
        if (request.method === "GET" && route === "/tracking") {
            return await tracking(request);
        }
        if (request.method === "GET" && route === "/parse-tracking-link") {
            return await parseTrackingLink(request);
        }

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});
