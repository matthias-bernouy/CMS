insert into commerce.notification_rules (
    key, event_type, audience, label, description, policy, template_key, stale_policy
) values
    (
        'commerce.price_agreement.accepted', 'commerce.price_agreement.accepted', 'buyer',
        'Offer accepted', 'Invite the buyer to pay the exact accepted negotiated amount.',
        'required', 'commerce.price_agreement.accepted', 'always_send'
    ),
    (
        'commerce.order.paid', 'commerce.order.paid', 'buyer', 'Purchase confirmation',
        'Confirm that payment was accepted and the order is active.',
        'required', 'commerce.order.paid', 'always_send'
    ),
    (
        'commerce.order.cancelled', 'commerce.order.cancelled', 'buyer', 'Order cancelled',
        'Confirm that an order was cancelled.',
        'required', 'commerce.order.cancelled', 'always_send'
    ),
    (
        'commerce.order.refunded', 'commerce.order.refunded', 'buyer', 'Order refunded',
        'Confirm that a refund was completed.',
        'required', 'commerce.order.refunded', 'always_send'
    ),
    (
        'commerce.order.fulfillment.carrier_accepted', 'commerce.order.fulfillment.carrier_accepted', 'buyer',
        'Carrier accepted the parcel', 'Notify when the carrier accepts the parcel.',
        'default_on', 'commerce.order.fulfillment.carrier_accepted', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.in_transit', 'commerce.order.fulfillment.in_transit', 'buyer',
        'Parcel in transit', 'Notify when the parcel enters transit.',
        'default_on', 'commerce.order.fulfillment.in_transit', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.available_for_pickup', 'commerce.order.fulfillment.available_for_pickup', 'buyer',
        'Parcel available for pickup', 'Notify when the parcel can be collected.',
        'default_on', 'commerce.order.fulfillment.available_for_pickup', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.collected_by_recipient', 'commerce.order.fulfillment.collected_by_recipient', 'buyer',
        'Parcel collected', 'Confirm that the recipient collected the parcel.',
        'default_on', 'commerce.order.fulfillment.collected_by_recipient', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.incident', 'commerce.order.fulfillment.incident', 'buyer',
        'Delivery incident', 'Notify about a carrier delivery incident.',
        'default_on', 'commerce.order.fulfillment.incident', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.lost', 'commerce.order.fulfillment.lost', 'buyer',
        'Parcel lost', 'Notify when the carrier reports the parcel as lost.',
        'default_on', 'commerce.order.fulfillment.lost', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.returning_to_sender', 'commerce.order.fulfillment.returning_to_sender', 'buyer',
        'Parcel returning to sender', 'Notify when a parcel starts returning to the sender.',
        'default_on', 'commerce.order.fulfillment.returning_to_sender', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.returned_to_sender', 'commerce.order.fulfillment.returned_to_sender', 'buyer',
        'Parcel returned to sender', 'Notify when a parcel has returned to the sender.',
        'default_on', 'commerce.order.fulfillment.returned_to_sender', 'drop_if_superseded'
    ),
    (
        'commerce.buyer.order.cancellation_started', 'commerce.buyer.order.cancellation_started', 'buyer',
        'Cancellation started', 'Notify the buyer while an order cancellation is being processed.',
        'required', 'commerce.buyer.order.cancellation_started', 'always_send'
    ),
    (
        'commerce.buyer.order.refund_started', 'commerce.buyer.order.refund_started', 'buyer',
        'Refund started', 'Confirm that a refund request is being processed.',
        'required', 'commerce.buyer.order.refund_started', 'always_send'
    ),
    (
        'commerce.buyer.order.refund_failed', 'commerce.buyer.order.refund_failed', 'buyer',
        'Refund needs attention', 'Notify the buyer when a refund cannot be completed normally.',
        'required', 'commerce.buyer.order.refund_failed', 'always_send'
    ),
    (
        'commerce.buyer.claim.updated', 'commerce.buyer.claim.updated', 'buyer',
        'Claim updated', 'Notify the buyer about a meaningful claim status change.',
        'required', 'commerce.buyer.claim.updated', 'always_send'
    ),
    (
        'commerce.buyer.order.fulfillment.pickup_expired',
        'commerce.buyer.order.fulfillment.pickup_expired', 'buyer',
        'Pickup period expired', 'Notify the buyer when the parcel pickup period expires.',
        'required', 'commerce.buyer.order.fulfillment.pickup_expired', 'always_send'
    ),
    (
        'commerce.seller.sale.paid', 'commerce.seller.sale.paid', 'seller',
        'Sale paid', 'Tell the seller that payment succeeded and shipment can be prepared.',
        'required', 'commerce.seller.sale.paid', 'always_send'
    ),
    (
        'commerce.seller.sale.shipment_reminder', 'commerce.seller.sale.shipment_reminder', 'seller',
        'Shipment reminder', 'Remind the seller to hand the parcel to the carrier before the deadline.',
        'default_on', 'commerce.seller.sale.shipment_reminder', 'always_send'
    ),
    (
        'commerce.seller.sale.shipment_deadline_elapsed',
        'commerce.seller.sale.shipment_deadline_elapsed', 'seller',
        'Shipment deadline elapsed', 'Tell the seller that the shipment deadline has elapsed.',
        'required', 'commerce.seller.sale.shipment_deadline_elapsed', 'always_send'
    ),
    (
        'commerce.seller.sale.cancellation_started',
        'commerce.seller.sale.cancellation_started', 'seller',
        'Cancellation started', 'Notify the seller when the buyer starts cancelling a sale.',
        'required', 'commerce.seller.sale.cancellation_started', 'always_send'
    ),
    (
        'commerce.seller.sale.refund_started', 'commerce.seller.sale.refund_started', 'seller',
        'Refund started', 'Notify the seller when a refund request affects a sale.',
        'required', 'commerce.seller.sale.refund_started', 'always_send'
    ),
    (
        'commerce.seller.sale.refunded', 'commerce.seller.sale.refunded', 'seller',
        'Sale refunded', 'Notify the seller when the refund is completed.',
        'required', 'commerce.seller.sale.refunded', 'always_send'
    ),
    (
        'commerce.seller.claim.action_required', 'commerce.seller.claim.action_required', 'seller',
        'Claim response required', 'Notify the seller when a buyer claim requires a response.',
        'required', 'commerce.seller.claim.action_required', 'always_send'
    ),
    (
        'commerce.seller.claim.updated', 'commerce.seller.claim.updated', 'seller',
        'Claim updated', 'Notify the seller about a meaningful claim status change.',
        'required', 'commerce.seller.claim.updated', 'always_send'
    ),
    (
        'commerce.seller.sale.fulfillment.updated',
        'commerce.seller.sale.fulfillment.updated', 'seller',
        'Shipment updated', 'Notify the seller about an exceptional or terminal shipment status.',
        'default_on', 'commerce.seller.sale.fulfillment.updated', 'drop_if_superseded'
    ),
    (
        'commerce.admin.action_required', 'commerce.admin.action_required', 'admin',
        'Commerce action required', 'Notify configured administrators when manual action is required.',
        'required', 'commerce.admin.action_required', 'always_send'
    ),
    (
        'commerce.admin.financial_exception', 'commerce.admin.financial_exception', 'admin',
        'Financial exception', 'Notify configured administrators about high or critical financial exceptions.',
        'required', 'commerce.admin.financial_exception', 'always_send'
    )
on conflict (key) do update set
    event_type = excluded.event_type,
    audience = excluded.audience,
    label = excluded.label,
    description = excluded.description,
    policy = excluded.policy,
    template_key = excluded.template_key,
    stale_policy = excluded.stale_policy,
    updated_at = now();
