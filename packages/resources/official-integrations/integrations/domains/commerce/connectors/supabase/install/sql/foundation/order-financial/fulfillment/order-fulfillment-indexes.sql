
create index if not exists order_fulfillments_status_deadline_idx
    on commerce.order_fulfillments(status, release_eligible_at)
    where status not in ('cancelled', 'returned_to_sender');

create index if not exists order_fulfillments_seller_handoff_due_idx
    on commerce.order_fulfillments(seller_handoff_deadline, order_id)
    where payment_confirmed_at is not null
      and seller_handoff_declared_at is null
      and carrier_accepted_at is null
      and status in ('awaiting_shipment', 'shipment_creating', 'label_created');

drop index if exists commerce.order_fulfillments_scan_grace_due_idx;
create index order_fulfillments_scan_grace_due_idx
    on commerce.order_fulfillments(scan_grace_deadline, order_id)
    where payment_confirmed_at is not null
      and carrier_accepted_at is null
      and status in (
          'awaiting_shipment', 'shipment_creating', 'label_created',
          'seller_handoff_declared'
      );
