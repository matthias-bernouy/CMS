import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import {
    claimRow,
    useClaimDetailResponder,
} from "./fixtures";
import { expectedClaimDetail } from "./expected";

installCommerceTestEnvironment();

describe("commerce administrator claim detail contracts", () => {
    test("preserves the complete claim bundle, collection order, and opaque JSON", async () => {
        useClaimDetailResponder();

        const response = await requestCommerce("/admin/claim?id=7");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedClaimDetail());
    });

    test("preserves every nullable claim field and empty collection", async () => {
        useClaimDetailResponder({
            claim: {
                ...claimRow,
                buyer_requested_amount: null,
                resolution_outcome: null,
                decision_reason: null,
                return_ship_by_at: null,
                return_delivery_status: null,
                return_provider_reference: null,
                return_carrier_accepted_at: null,
            },
            events: [],
            evidence: [],
            returnEvents: [],
        });

        const response = await requestCommerce("/admin/claim?id=7");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            ...expectedClaimDetail(),
            buyerRequestedAmount: null,
            resolutionOutcome: null,
            decisionReason: null,
            returnShipByAt: null,
            returnDeliveryStatus: null,
            returnProviderReference: null,
            returnCarrierAcceptedAt: null,
            events: [],
            evidence: [],
            returnEvents: [],
        });
    });

    test("never returns evidence storage coordinates, submitter identity, or provider evidence", async () => {
        useClaimDetailResponder();

        const body = await (await requestCommerce("/admin/claim?id=7")).json();
        const serialized = JSON.stringify(body);

        expect(serialized).not.toContain("storageBucket");
        expect(serialized).not.toContain("storagePath");
        expect(serialized).not.toContain("buyer-17\",\"storage");
        expect(serialized).not.toContain("providerEvidence");
        expect(body.evidence.map((item: { id: number }) => item.id)).toEqual([81, 82]);
        expect(body.returnEvents.map((item: { id: number }) => item.id)).toEqual([91, 92]);
    });
});
