import { makeEndpointUrn, makeSourceUrn, type DataShape, type Source, type SourceEndpoint } from "@bernouy/cms-sources";

export const string = (): DataShape => ({ type: "string" });
export const number = (): DataShape => ({ type: "number" });
export const boolean = (): DataShape => ({ type: "boolean" });
export const object = (properties: Record<string, DataShape>): DataShape => ({ type: "object", properties });
export const array = (properties: Record<string, DataShape>): DataShape => ({
    type: "array",
    items: object(properties),
});

export function makeSource(id: string, endpoints: SourceEndpoint[]): Source {
    return { urn: makeSourceUrn(id), endpoints };
}

export function endpoint(
    id: string,
    method: "GET" | "POST",
    path: string,
    output: DataShape,
    params?: Record<string, DataShape>,
    body?: Record<string, DataShape>,
    access: "admin" | "auth" | "system" = "admin",
    statuses = ["200"],
): SourceEndpoint {
    return {
        urn: makeEndpointUrn(
            path.includes("getAccount") ? "accounts" : deliveryPath(path) ? "delivery" : "commerce",
            id,
        ),
        method,
        access: { mode: access },
        targetUrl: `https://provider.test${path}`,
        input:
            method === "GET"
                ? {
                      params: Object.entries(params ?? {}).map(([name, schema]) => ({
                          name,
                          in: "query" as const,
                          schema,
                      })),
                  }
                : { body: object(body ?? {}) },
        output: statuses.map((status) => ({
            status,
            body: Number(status) >= 400 ? object({ error: string() }) : output,
        })),
    };
}

function deliveryPath(path: string): boolean {
    return [
        "/resolveDeliveryQuote",
        "/saveClaimReturnRelaySelection",
        "/relaySelection",
        "/saveRelaySelection",
        "/createShipment",
        "/shipments",
        "/shipmentForExternalOrder",
        "/shipment",
        "/tracking",
        "/shipmentTrackingContext",
        "/issueLabelAccess",
        "/declareSellerHandoff",
        "/reconcileShipments",
        "/acknowledgeShipmentEvent",
        "/failShipmentEventProjection",
        "/cancelShipmentReservation",
        "/deliveryProjectionHealth",
        "/recoverUnknownShipment",
    ].includes(path);
}

export function fulfillmentAddressShape(): DataShape {
    return object({
        name: string(),
        firstName: string(),
        lastName: string(),
        phone: string(),
        addressLine1: string(),
        addressLine2: string(),
        addressLine3: string(),
        postalCode: string(),
        city: string(),
        country: string(),
        email: string(),
    });
}
