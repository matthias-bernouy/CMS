import { describe, expect, test } from "bun:test";

import { shipmentPresentation } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/account/orders/order/presentation/shipment.ts";
import {
    normalizedPaymentState,
    orderPresentation,
} from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/account/orders/order/presentation/status.ts";
import { orderStatus } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/account/orders/purchases/presentation.ts";
import { saleStatus } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/accounts/commerce-account-sales/controller/status.ts";

const copy = (key: string): string => key;

describe("Mossa commerce state presentation", () => {
    test("keeps terminal order truth above stale payment and shipment projections", () => {
        expect(orderStatus("expired", { paymentStatus: "succeeded", fulfillmentStatus: "in_transit" })).toEqual({
            key: "expired",
            tone: "info",
        });
        expect(saleStatus("cancelled", { paymentStatus: "succeeded", fulfillmentStatus: "label_created" })).toBe(
            "cancelled",
        );
        expect(orderPresentation("expired", "succeeded", "in_transit", copy)).toEqual({
            label: "state-expired",
            tone: "info",
        });
        expect(shipmentPresentation("cancelled", "succeeded", "in_transit", copy)).toMatchObject({
            title: "state-cancelled",
            stage: 0,
        });
    });

    test("projects active fulfillment without pretending a handoff is a carrier scan", () => {
        expect(
            orderStatus("active", { paymentStatus: "succeeded", fulfillmentStatus: "available_for_pickup" }),
        ).toEqual({ key: "pickup-ready", tone: "success" });
        expect(saleStatus("active", { paymentStatus: "succeeded", fulfillmentStatus: "awaiting_shipment" })).toBe(
            "awaiting_shipment",
        );
        expect(orderPresentation("active", "succeeded", "seller_handoff_declared", copy).label).toBe(
            "state-handoff-declared",
        );
        expect(shipmentPresentation("active", "succeeded", "seller_handoff_declared", copy)).toMatchObject({
            title: "state-parcel-handoff-declared",
            stage: 1,
        });
    });

    test("surfaces refunds, disputes, and manual reviews before ordinary fulfillment", () => {
        expect(saleStatus("active", { settlementStatus: "refund_pending", fulfillmentStatus: "in_transit" })).toBe(
            "refund_in_progress",
        );
        expect(saleStatus("active", { claimStatus: "under_review", fulfillmentStatus: "in_transit" })).toBe(
            "dispute_in_progress",
        );
        expect(orderStatus("active", { settlementStatus: "manual_review", fulfillmentStatus: "in_transit" })).toEqual({
            key: "review-required",
            tone: "danger",
        });
        expect(normalizedPaymentState({ settlementStatus: "reversal_pending" }, {})).toBe("refund_pending");
    });
});
