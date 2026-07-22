import { makeEndpointUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import { computedUserHeader, object, text } from "../../shared/shapes";
import { shipmentForExternalOrderEndpoint } from "../../shared/sources";

export function sellerDeliveryEndpoints(): SourceEndpoint[] {
    return [shipmentForExternalOrderEndpoint(), issueLabelAccess(), declareSellerHandoff()];
}

function issueLabelAccess(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("delivery", "issueLabelAccess"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://delivery.test/issueLabelAccess",
        input: {
            body: object(
                {
                    externalOrderId: text(),
                    sellerCmsUserId: text(),
                },
                ["externalOrderId", "sellerCmsUserId"],
            ),
        },
        output: [
            {
                status: "201",
                body: object(
                    {
                        token: text(),
                        expiresAt: text(),
                    },
                    ["token", "expiresAt"],
                ),
            },
            {
                status: "404",
                body: object({ error: text() }, ["error"]),
            },
            {
                status: "409",
                body: object({ error: text() }, ["error"]),
            },
        ],
    };
}

function declareSellerHandoff(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("delivery", "declareSellerHandoff"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://delivery.test/declareSellerHandoff",
        headers: computedUserHeader(),
        input: {
            body: object({ externalOrderId: text() }, ["externalOrderId"]),
        },
        output: [
            {
                status: "200",
                body: object(
                    {
                        id: text(),
                        externalOrderId: text(),
                        expeditionNumber: text(true),
                        status: text(),
                        sellerHandoffDeclaredAt: text(),
                    },
                    ["id", "externalOrderId", "status", "sellerHandoffDeclaredAt"],
                ),
            },
        ],
    };
}
