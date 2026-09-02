import { orderId, orderPublicId, reservation } from "./context";
import { replayShipment, shipment } from "./delivery";

export const fulfillment = {
    id: 501,
    orderId,
    businessKey: reservation.businessKey,
    deliveryQuoteId: reservation.deliveryQuoteId,
    financialTermsHash: reservation.financialTermsHash,
    status: "succeeded",
    attempts: 1,
    providerReference: shipment.expeditionNumber,
    providerShipmentId: shipment.id,
    lastError: null,
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T08:01:01.000Z",
    idempotentReplay: false,
    fulfillment: {
        status: "label_created",
        providerReference: shipment.expeditionNumber,
        version: 2,
        updatedAt: "2026-07-21T08:01:01.000Z",
    },
};

const { fulfillment: _freshProjection, ...completedOperation } = fulfillment;

export const replayFulfillment = {
    ...completedOperation,
    idempotentReplay: true,
};

export const creationResult = {
    orderId,
    orderPublicId,
    shipment,
    fulfillment,
};

export const replayResult = {
    orderId,
    orderPublicId,
    shipment: replayShipment,
    fulfillment: replayFulfillment,
};

export function expectedCompletionRequest() {
    return {
        operationId: reservation.operationId,
        claimToken: reservation.claimToken,
        providerReference: shipment.expeditionNumber,
        providerShipmentId: shipment.id,
        providerSnapshot: {
            status: shipment.status,
            createdAt: shipment.createdAt,
        },
    };
}
