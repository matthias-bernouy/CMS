import { HttpError, json, requireCmsRequest, requiredQuery } from "../../http.ts";
import { relayPointsFromUrl } from "../../provider/relay/index.ts";
import { readRelaySelectionContext } from "../../shipment/read-contexts.ts";
import { settingsRow } from "../../shipment/supabase/index.ts";
import { settingsFromRow } from "../settings/presentation.ts";
import { deliveryQuoteJson, relaySelectionJson } from "./presentation.ts";

export async function relayPoints(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const [items, deliverySettings] = await Promise.all([
        relayPointsFromUrl(new URL(request.url)),
        settingsRow().then(settingsFromRow),
    ]);
    return json({
        items: items.map((item) => ({
            ...item,
            shippingAmount: deliverySettings.defaultShippingAmount,
            currency: deliverySettings.declaredCurrency.toLowerCase(),
        })),
    });
}

export async function relaySelection(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const externalOrderId = requiredQuery(new URL(request.url), "externalOrderId");
    const selectedForCmsUserId = request.headers.get("x-cms-user-id")?.trim() || "";
    const context = await readRelaySelectionContext(externalOrderId, selectedForCmsUserId);
    if (context.outcome === "selection") {
        return json(relaySelectionJson(context.row));
    }
    if (context.outcome === "quote") {
        return json(deliveryQuoteJson(context.row));
    }
    throw new HttpError(404, "no pickup point is saved for this order");
}
