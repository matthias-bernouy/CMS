import { expect } from "@bernouy/cms-integration-verification/sdk/v1";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const trackedShipment = defineUpgradeScenario({
    name: "preserves an active shipment and its pending carrier event",
    from: ">=1.0.0 <3.0.0",
    async seedBeforeUpgrade(context) {
        const shipmentId = "upgrade-fixture-shipment";
        const orderId = "upgrade-fixture-order";
        const eventKey = "upgrade-fixture-event";
        await context.database.query(
            `insert into delivery.shipments
                (id, external_order_id, idempotency_key, expedition_number, tracking_number, status,
                 seller_cms_user_id, recipient_name, recipient_email, recipient_address_line1,
                 recipient_postal_code, recipient_city, recipient_country, weight_grams,
                 declared_value_minor_amount, declared_currency, metadata, raw_request, raw_response, created_by)
             values ($1::text, $2::text, $2::text, 'MR-UPGRADE-42', 'MR-UPGRADE-42', 'in_transit',
                     'seller-upgrade', 'Fixture Buyer', 'buyer@example.test', '1 rue des Tests',
                     '75001', 'Paris', 'FR', 750, 12900, 'EUR',
                     jsonb_build_object('commerceOrderId', $2::text, 'fixture', true),
                     jsonb_build_object('externalOrderId', $2::text),
                     jsonb_build_object('provider', 'mondial-relay', 'accepted', true), 'fixture-author')`,
            [shipmentId, orderId],
        );
        await context.database.query(
            `insert into delivery.shipment_events
                (shipment_id, order_public_id, expedition_number, event_label, provider_event_key,
                 normalized_status, occurred_at, location, relay_number, relay_country, raw_event)
             values ($1::text, $2::text, 'MR-UPGRADE-42', 'Parcel is moving', $3::text,
                     'in_transit', '2026-06-02T12:00:00Z', 'Paris', '024474', 'FR',
                     jsonb_build_object('code', 'IN_TRANSIT', 'source', 'fixture'))`,
            [shipmentId, orderId, eventKey],
        );
        return { shipmentId, orderId, eventKey };
    },
    async assertAfterUpgrade(context, state) {
        const shipments = await context.database.query(
            `select id as "shipmentId", external_order_id as "orderId", status, recipient_email as "recipientEmail",
                    weight_grams as "weightGrams", declared_value_minor_amount::text as "declaredValue",
                    metadata->>'fixture' as fixture, raw_response->>'accepted' as accepted
             from delivery.shipments where id = $1`,
            [state.shipmentId],
        );
        expect(shipments).toEqual([
            {
                shipmentId: state.shipmentId,
                orderId: state.orderId,
                status: "in_transit",
                recipientEmail: "buyer@example.test",
                weightGrams: 750,
                declaredValue: "12900",
                fixture: "true",
                accepted: "true",
            },
        ]);
        const events = await context.database.query(
            `select provider_event_key as "eventKey", normalized_status as status,
                    location, relay_number as "relayNumber", raw_event->>'source' as source
             from delivery.shipment_events where shipment_id = $1`,
            [state.shipmentId],
        );
        expect(events).toEqual([
            {
                eventKey: state.eventKey,
                status: "in_transit",
                location: "Paris",
                relayNumber: "024474",
                source: "fixture",
            },
        ]);
    },
});

export default defineUpgradeScenarios({
    schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
    scenarios: [trackedShipment],
});
