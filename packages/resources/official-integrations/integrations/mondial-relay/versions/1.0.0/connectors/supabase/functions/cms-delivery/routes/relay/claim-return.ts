import { HttpError, json, readJsonObject, requireCmsWriteRequest } from "../../http.ts";
import { relayPointsFromUrl } from "../../provider/relay.ts";
import { stringValue } from "../../shipment/payload.ts";
import { readRelaySelectionSetupContext } from "../../shipment/read-contexts.ts";
import { upsertRelaySelectionRow } from "../../shipment/supabase.ts";
import { requiredBodyText } from "../body.ts";
import { settingsFromRow } from "../settings/presentation.ts";
import { relaySelectionJson } from "./presentation.ts";
import { captureValidation } from "./validation.ts";

export async function saveClaimReturnRelaySelection(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const selectedBy = request.headers.get("x-cms-user-id")?.trim() || "";
    if (!selectedBy) {
        throw new HttpError(401, "CMS user is missing");
    }
    const body = await readJsonObject(request);
    const externalOrderId = requiredBodyText(body, "externalOrderId", 200);
    if (!/^claim-return:[1-9][0-9]*$/.test(externalOrderId)) {
        throw new HttpError(400, "legacy relay selection is restricted to claim returns");
    }
    const validation = captureValidation(() => ({
        relayLocation: requiredBodyText(body, "relayLocation", 23).toUpperCase(),
        country: (stringValue(body.country) || "FR").toUpperCase(),
        postalCode: requiredBodyText(body, "postalCode", 20),
        city: stringValue(body.city).slice(0, 120),
    }));
    const setup = await readRelaySelectionSetupContext(externalOrderId, validation.ok);
    if (setup.outcome === "shipment_exists") {
        throw new HttpError(409, "relay selection cannot change after shipment creation has started");
    }
    if (!validation.ok) {
        throw validation.error;
    }
    const { relayLocation, country, postalCode, city } = validation.value;
    const deliverySettings = settingsFromRow(setup.settings);
    if (!/^[A-Z]{2}-[A-Z0-9]{1,20}$/.test(relayLocation) || country !== "FR") {
        throw new HttpError(400, "claim return pickup point is invalid");
    }
    const lookupUrl = new URL("https://cms-delivery.local/relay-points");
    lookupUrl.searchParams.set("country", country);
    lookupUrl.searchParams.set("postalCode", postalCode);
    if (city) {
        lookupUrl.searchParams.set("city", city);
    }
    lookupUrl.searchParams.set("weightGrams", String(deliverySettings.defaultWeightGrams));
    lookupUrl.searchParams.set("limit", "8");
    const point = (await relayPointsFromUrl(lookupUrl)).find(
        (item) => item.location === relayLocation && item.pointType === "relay_point",
    );
    if (!point) {
        throw new HttpError(409, "the selected pickup point is unavailable or does not match the search area");
    }
    const row = await upsertRelaySelectionRow({
        external_order_id: externalOrderId,
        relay_location: point.location,
        relay_country: point.country,
        relay_number: point.number,
        relay_name: point.name,
        address_line1: point.addressLine1,
        address_line2: point.addressLine2,
        postal_code: point.postalCode,
        city: point.city,
        latitude: point.latitude,
        longitude: point.longitude,
        weight_grams: deliverySettings.defaultWeightGrams,
        shipping_amount: deliverySettings.defaultShippingAmount,
        currency: deliverySettings.declaredCurrency.toLowerCase(),
        selected_by: selectedBy,
        snapshot: point,
    });
    return json(relaySelectionJson(row));
}
