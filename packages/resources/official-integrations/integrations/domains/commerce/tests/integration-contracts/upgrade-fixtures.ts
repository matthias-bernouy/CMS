import { assert, expect } from "@bernouy/cms-integration-verification/sdk/v1";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const activeCheckout = defineUpgradeScenario({
    name: "preserves an active offer and its reserved checkout",
    from: "^1.0.0",
    async seedBeforeUpgrade(context) {
        const [product] = await context.database.query(
            `insert into commerce.products (slug, title, description, status, visibility, metadata)
             values ($1, $2, $3, 'active', 'public', '{"fixture":true}'::jsonb)
             returning id::text as id`,
            ["upgrade-racket", "Upgrade racket", "Persisted product"],
        );
        const productId = requiredId(product?.id, "product");
        const [seller] = await context.database.query(
            `insert into commerce.sellers
                (kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by, metadata, version)
             values ('user', $1, $2, $3, 'verified', '2026-06-01T09:00:00Z', $4,
                     '{"fixture":true}'::jsonb, 3)
             returning id::text as id`,
            ["upgrade-seller-user", "upgrade-seller", "Upgrade seller", "fixture-admin"],
        );
        const sellerId = requiredId(seller?.id, "seller");
        const [offer] = await context.database.query(
            `insert into commerce.offers
                (seller_id, product_id, slug, title, description, condition_code, publication_status,
                 workflow_state, accepted_price_amount, currency, availability, quantity_available, metadata, version)
             values ($1::bigint, $2::bigint, $3, $4, $5, 'good', 'active',
                     'approved', 12900, 'eur', 'available', 4, '{"fixture":true}'::jsonb, 6)
             returning id::text as id`,
            [sellerId, productId, "upgrade-racket-offer", "Upgrade racket offer", "Persisted offer"],
        );
        const offerId = requiredId(offer?.id, "offer");
        const buyerId = "upgrade-buyer-user";
        const idempotencyKey = "upgrade-checkout";
        const [order] = await context.database.query(
            `select result->>'id' as "orderId", result->>'public_id' as "orderPublicId",
                    result->>'order_number' as "orderNumber"
             from (select commerce.create_order_from_offers(
                 $1, $2, jsonb_build_array(jsonb_build_object('offerId', $3::bigint, 'quantity', 2)),
                 jsonb_build_object('city', 'Paris', 'country', 'FR'),
                 jsonb_build_object('city', 'Lyon', 'country', 'FR')
             ) as result) created`,
            [buyerId, idempotencyKey, offerId],
        );
        return {
            productId,
            sellerId,
            offerId,
            orderId: requiredId(order?.orderId, "order"),
            orderPublicId: requiredId(order?.orderPublicId, "order public id"),
            orderNumber: requiredId(order?.orderNumber, "order number"),
            buyerId,
            idempotencyKey,
        };
    },
    async assertAfterUpgrade(context, state) {
        const [replay] = await context.database.query(
            `select result->>'id' as "orderId", result->>'idempotent_replay' as replay
             from (select commerce.create_order_from_offers(
                 $1, $2, jsonb_build_array(jsonb_build_object('offerId', $3::bigint, 'quantity', 2)),
                 jsonb_build_object('city', 'Paris', 'country', 'FR'),
                 jsonb_build_object('city', 'Lyon', 'country', 'FR')
             ) as result) replayed`,
            [state.buyerId, state.idempotencyKey, state.offerId],
        );
        expect(replay).toEqual({ orderId: state.orderId, replay: "true" });

        const rows = await context.database.query(
            `select product.id::text as "productId", seller.id::text as "sellerId",
                    offer.id::text as "offerId", order_row.id::text as "orderId",
                    order_row.public_id::text as "orderPublicId", order_row.order_number as "orderNumber",
                    product.title as "productTitle", seller.verification_status as "sellerStatus",
                    offer.title as "offerTitle", offer.publication_status as "offerStatus",
                    offer.workflow_state as "workflowState", offer.accepted_price_amount::text as "offerAmount",
                    offer.quantity_available as "quantityAvailable", order_row.status as "orderStatus",
                    order_row.subtotal_amount::text as subtotal, order_row.total_amount::text as total,
                    order_row.shipping_address->>'city' as "shippingCity",
                    line.quantity, line.inventory_reserved as "inventoryReserved",
                    line.unit_amount::text as "unitAmount", line.total_amount::text as "lineTotal",
                    line.product_snapshot->>'title' as "snapshotProductTitle",
                    line.offer_snapshot->>'slug' as "snapshotOfferSlug",
                    line.seller_snapshot->>'displayName' as "snapshotSellerName"
             from commerce.products product
             join commerce.offers offer on offer.product_id = product.id
             join commerce.sellers seller on seller.id = offer.seller_id
             join commerce.order_lines line on line.offer_id = offer.id
             join commerce.orders order_row on order_row.id = line.order_id
             where product.id = $1::bigint and seller.id = $2::bigint
               and offer.id = $3::bigint and order_row.id = $4::bigint`,
            [state.productId, state.sellerId, state.offerId, state.orderId],
        );
        expect(rows).toEqual([
            {
                productId: state.productId,
                sellerId: state.sellerId,
                offerId: state.offerId,
                orderId: state.orderId,
                orderPublicId: state.orderPublicId,
                orderNumber: state.orderNumber,
                productTitle: "Upgrade racket",
                sellerStatus: "verified",
                offerTitle: "Upgrade racket offer",
                offerStatus: "active",
                workflowState: "approved",
                offerAmount: "12900",
                quantityAvailable: 2,
                orderStatus: "awaiting_quote",
                subtotal: "25800",
                total: "25800",
                shippingCity: "Paris",
                quantity: 2,
                inventoryReserved: 2,
                unitAmount: "12900",
                lineTotal: "25800",
                snapshotProductTitle: "Upgrade racket",
                snapshotOfferSlug: "upgrade-racket-offer",
                snapshotSellerName: "Upgrade seller",
            },
        ]);

        const events = await context.database.query(
            `select event_type as "eventType", actor_kind as "actorKind", actor_id as "actorId"
             from commerce.order_events where order_id = $1::bigint order by id`,
            [state.orderId],
        );
        expect(events).toEqual([{ eventType: "order_created", actorKind: "buyer", actorId: state.buyerId }]);

        const response = await context.cms.request("/.cms/sources/commerce/offer?slug=upgrade-racket-offer");
        assert(response.status === 200, `CMS offer read returned HTTP ${response.status}`);
        assert(response.body && typeof response.body === "object" && !Array.isArray(response.body));
        assert(response.body.slug === "upgrade-racket-offer", "CMS offer read did not preserve the public slug");
        assert(response.body.acceptedPriceAmount === 12900, "CMS offer read did not preserve the accepted price");
        assert(response.body.quantityAvailable === 2, "CMS offer read did not preserve reserved inventory");
    },
});

export default defineUpgradeScenarios({
    schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
    scenarios: [activeCheckout],
});

function requiredId(value: unknown, resource: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`Upgrade fixture did not create its ${resource}`);
    }
    return value;
}
