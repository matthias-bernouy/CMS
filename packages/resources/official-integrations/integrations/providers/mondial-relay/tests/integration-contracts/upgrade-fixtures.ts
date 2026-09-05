import { assert, expect, type VerificationValue } from "@bernouy/cms-integration-verification/sdk/v1";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    type UpgradeFixtureContextV1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const shipmentId = "upgrade-fixture-shipment";
const orderId = "upgrade-fixture-order";

type Snapshot = Record<string, VerificationValue>;

async function snapshot(context: UpgradeFixtureContextV1): Promise<Snapshot> {
    const shipments = await context.database.query(
        "select to_jsonb(s)::text as value from delivery.shipments s where id = $1",
        [shipmentId],
    );
    const events = await context.database.query(
        "select to_jsonb(e)::text as value from delivery.shipment_events e where shipment_id = $1 order by id",
        [shipmentId],
    );
    const relay = await context.database.query(
        "select to_jsonb(r)::text as value from delivery.relay_selections r where external_order_id = $1",
        [orderId],
    );
    const settings = await context.database.query(
        "select to_jsonb(s)::text as value from delivery.settings s where id = 'default'",
    );
    return {
        shipments: shipments.map((row) => row.value),
        events: events.map((row) => row.value),
        relay: relay.map((row) => row.value),
        settings: settings.map((row) => row.value),
    };
}

async function assertReadable(context: UpgradeFixtureContextV1): Promise<void> {
    const health = await context.cms.request("/.cms/sources/delivery/health");
    expect(health.status).toBe(200);
    assert(health.body && typeof health.body === "object" && !Array.isArray(health.body));
    expect(health.body.ok).toBe(true);
    const response = await context.cms.request(`/.cms/sources/delivery/shipments?externalOrderId=${orderId}&limit=10`);
    expect(response.status).toBe(200);
    assert(response.body && typeof response.body === "object" && !Array.isArray(response.body));
    const items = response.body.items;
    assert(Array.isArray(items));
    expect(items).toHaveLength(1);
    assert(items[0] && typeof items[0] === "object" && !Array.isArray(items[0]));
    expect(items[0].id).toBe(shipmentId);
    expect(items[0].status).toBe("in_transit");
    expect(items[0].expeditionNumber).toBe("12345678");
}

const preservedShipment = defineUpgradeScenario<Snapshot>({
    name: "preserves shipments, relay selections, events and settings across the staged function switch",
    from: "1.0.0",
    async seedBeforeUpgrade(context) {
        await context.database.query(
            `insert into delivery.shipments (
                id, external_order_id, expedition_number, status, label_url,
                recipient_name, recipient_postal_code, recipient_city, weight_grams,
                seller_cms_user_id, metadata, raw_response, carrier_accepted_at
            ) values ($1, $2, '12345678', 'in_transit', 'https://example.invalid/fixture-label.pdf',
                'Fixture recipient', '75001', 'Paris', 750, 'fixture-seller',
                '{"fixture":"preserve-metadata","insured":true}'::jsonb,
                '{"fixture":"preserve-provider-response"}'::jsonb, '2026-01-01T12:00:00Z')`,
            [shipmentId, orderId],
        );
        await context.database.query(
            `insert into delivery.shipment_events (
                shipment_id, order_public_id, expedition_number, event_label,
                provider_event_key, normalized_status, occurred_at, raw_event,
                projection_status, commerce_projected_at
            ) values ($1, $2, '12345678', 'Fixture carrier event', 'fixture-carrier-event',
                'in_transit', '2026-01-01T12:00:00Z', '{"fixture":true}'::jsonb,
                'projected', '2026-01-01T12:01:00Z')`,
            [shipmentId, orderId],
        );
        await context.database.query(
            `insert into delivery.relay_selections (
                external_order_id, relay_location, relay_country, relay_number, relay_name,
                address_line1, postal_code, city, weight_grams, selected_by, snapshot
            ) values ($1, 'FR-FIXTURE', 'FR', 'FIXTURE', 'Fixture pickup point',
                '1 Fixture Street', '75001', 'Paris', 750, 'fixture-buyer', '{"fixture":true}'::jsonb)`,
            [orderId],
        );
        await context.database.query("update delivery.settings set default_weight_grams = 750 where id = 'default'");
        await assertReadable(context);
        return snapshot(context);
    },
    async assertAfterUpgrade(context, state) {
        expect(await snapshot(context)).toEqual(state);
        await assertReadable(context);
        const health = await context.cms.request("/.cms/sources/delivery/migration-health");
        expect(health.status).toBe(200);
        expect(health.body).toEqual({ ok: true });
    },
});

export default defineUpgradeScenarios({
    schema: "ulvia.upgrade-fixtures.v1",
    scenarios: [preservedShipment],
});
