import { json, readJsonObject, requireCmsWriteRequest } from "../../http.ts";
import { stringValue } from "../../shipment/payload.ts";
import {
    cancelShipmentReservation,
    declareSellerHandoff,
    recoverUnknownShipment,
} from "../../shipment/shipment-operations.ts";
import { requiredBodyText } from "../body.ts";

export async function sellerHandoff(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    return json(
        await declareSellerHandoff(
            requiredBodyText(body, "externalOrderId", 200),
            request.headers.get("x-cms-user-id")?.trim() || "",
        ),
    );
}

export async function cancelShipment(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    return json(
        await cancelShipmentReservation(
            requiredBodyText(body, "externalOrderId", 200),
            requiredBodyText(body, "trackingUntil", 100),
        ),
    );
}

export async function recoverShipment(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const actorCmsUserId = request.headers.get("x-cms-user-id")?.trim() || "";
    return json(
        await recoverUnknownShipment(
            requiredBodyText(body, "shipmentId", 100),
            requiredBodyText(body, "externalOrderId", 200),
            requiredBodyText(body, "expeditionNumber", 8),
            stringValue(body.labelUrl),
            actorCmsUserId,
            requiredBodyText(body, "reason", 1000),
        ),
    );
}
