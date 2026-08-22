insert into commerce.notification_rules (
    key, event_type, label, description, policy, template_key, stale_policy
) values
    (
        'commerce.price_agreement.accepted', 'commerce.price_agreement.accepted',
        'Offer accepted', 'Invite the buyer to pay the exact accepted negotiated amount.',
        'required', 'commerce.price_agreement.accepted', 'always_send'
    ),
    (
        'commerce.order.paid', 'commerce.order.paid', 'Purchase confirmation',
        'Confirm that payment was accepted and the order is active.',
        'required', 'commerce.order.paid', 'always_send'
    ),
    (
        'commerce.order.cancelled', 'commerce.order.cancelled', 'Order cancelled',
        'Confirm that an order was cancelled.',
        'required', 'commerce.order.cancelled', 'always_send'
    ),
    (
        'commerce.order.refunded', 'commerce.order.refunded', 'Order refunded',
        'Confirm that a refund was completed.',
        'required', 'commerce.order.refunded', 'always_send'
    ),
    (
        'commerce.order.fulfillment.carrier_accepted', 'commerce.order.fulfillment.carrier_accepted',
        'Carrier accepted the parcel', 'Notify when the carrier accepts the parcel.',
        'default_on', 'commerce.order.fulfillment.carrier_accepted', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.in_transit', 'commerce.order.fulfillment.in_transit',
        'Parcel in transit', 'Notify when the parcel enters transit.',
        'default_on', 'commerce.order.fulfillment.in_transit', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.available_for_pickup', 'commerce.order.fulfillment.available_for_pickup',
        'Parcel available for pickup', 'Notify when the parcel can be collected.',
        'default_on', 'commerce.order.fulfillment.available_for_pickup', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.collected_by_recipient', 'commerce.order.fulfillment.collected_by_recipient',
        'Parcel collected', 'Confirm that the recipient collected the parcel.',
        'default_on', 'commerce.order.fulfillment.collected_by_recipient', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.incident', 'commerce.order.fulfillment.incident',
        'Delivery incident', 'Notify about a carrier delivery incident.',
        'default_on', 'commerce.order.fulfillment.incident', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.lost', 'commerce.order.fulfillment.lost',
        'Parcel lost', 'Notify when the carrier reports the parcel as lost.',
        'default_on', 'commerce.order.fulfillment.lost', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.returning_to_sender', 'commerce.order.fulfillment.returning_to_sender',
        'Parcel returning to sender', 'Notify when a parcel starts returning to the sender.',
        'default_on', 'commerce.order.fulfillment.returning_to_sender', 'drop_if_superseded'
    ),
    (
        'commerce.order.fulfillment.returned_to_sender', 'commerce.order.fulfillment.returned_to_sender',
        'Parcel returned to sender', 'Notify when a parcel has returned to the sender.',
        'default_on', 'commerce.order.fulfillment.returned_to_sender', 'drop_if_superseded'
    )
on conflict (key) do update set
    event_type = excluded.event_type,
    label = excluded.label,
    description = excluded.description,
    policy = excluded.policy,
    template_key = excluded.template_key,
    stale_policy = excluded.stale_policy,
    updated_at = now();
