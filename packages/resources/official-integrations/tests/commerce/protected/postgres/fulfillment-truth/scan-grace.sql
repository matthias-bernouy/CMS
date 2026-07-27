select clock_timestamp() - interval '2 hours' as scan_anchor \gset
select (:'scan_anchor'::timestamptz - interval '30 minutes') as timely_scan_at,
       (:'scan_anchor'::timestamptz + interval '30 minutes') as late_scan_at,
       clock_timestamp() as scan_webhook_at
\gset

select seed->>'orderId' timely_webhook_order_id,
       seed->>'publicId' timely_webhook_public_id
from (
    select pg_temp.seed_carrier_truth_case(
        'timely-webhook-first',
        :'scan_anchor'
    ) seed
) seeded
\gset
select seed->>'orderId' timely_cron_order_id,
       seed->>'publicId' timely_cron_public_id
from (
    select pg_temp.seed_carrier_truth_case(
        'timely-cron-first',
        :'scan_anchor'
    ) seed
) seeded
\gset

select webhook->>'scanGraceRecovered' as timely_webhook_recovered
from (
    select commerce.record_order_fulfillment_projection(
        :'timely_webhook_public_id',
        'delivery:scan:timely:webhook-first',
        'carrier_accepted',
        :'scan_webhook_at',
        'shipment-timely-webhook-first',
        null,
        :'timely_scan_at',
        null
    ) webhook
) projected
\gset

select commerce.process_due_order_deadlines(
    'carrier-truth:timely:cron-first',
    25
);

select webhook->>'scanGraceRecovered' as timely_cron_recovered
from (
    select commerce.record_order_fulfillment_projection(
        :'timely_cron_public_id',
        'delivery:scan:timely:cron-first',
        'carrier_accepted',
        :'scan_webhook_at',
        'shipment-timely-cron-first',
        null,
        :'timely_scan_at',
        null
    ) webhook
) projected
\gset

select pg_temp.assert_carrier_truth(
    :'timely_webhook_recovered'::boolean is false
    and :'timely_cron_recovered'::boolean is true
    and (
        select count(*)
        from commerce.order_fulfillments fulfillment
        join commerce.order_settlements settlement
          on settlement.order_id = fulfillment.order_id
        where fulfillment.order_id in (
            :timely_webhook_order_id,
            :timely_cron_order_id
        )
          and fulfillment.status = 'carrier_accepted'
          and fulfillment.carrier_accepted_at = :'timely_scan_at'
          and fulfillment.blocking_reason is null
          and settlement.status = 'held'
          and settlement.manual_review_reason is null
    ) = 2
    and exists (
        select 1
        from commerce.financial_exceptions
        where deduplication_key =
              'deadline:fulfillment:' || :timely_cron_order_id
          and status = 'resolved'
          and resolved_by = 'trusted-carrier-acceptance'
    ),
    'timely carrier evidence did not converge after webhook/cron permutations'
);

select seed->>'orderId' late_webhook_order_id,
       seed->>'publicId' late_webhook_public_id
from (
    select pg_temp.seed_carrier_truth_case(
        'late-webhook-first',
        :'scan_anchor'
    ) seed
) seeded
\gset
select seed->>'orderId' late_cron_order_id,
       seed->>'publicId' late_cron_public_id
from (
    select pg_temp.seed_carrier_truth_case(
        'late-cron-first',
        :'scan_anchor'
    ) seed
) seeded
\gset

select webhook->>'carrierAcceptanceAfterScanGrace'
           as late_webhook_after_grace
from (
    select commerce.record_order_fulfillment_projection(
        :'late_webhook_public_id',
        'delivery:scan:late:webhook-first',
        'in_transit',
        :'scan_webhook_at',
        'shipment-late-webhook-first',
        null,
        :'late_scan_at',
        null
    ) webhook
) projected
\gset

select commerce.process_due_order_deadlines(
    'carrier-truth:late:cron-first',
    25
);

select webhook->>'carrierAcceptanceAfterScanGrace'
           as late_cron_after_grace
from (
    select commerce.record_order_fulfillment_projection(
        :'late_cron_public_id',
        'delivery:scan:late:cron-first',
        'in_transit',
        :'scan_webhook_at',
        'shipment-late-cron-first',
        null,
        :'late_scan_at',
        null
    ) webhook
) projected
\gset

select pg_temp.assert_carrier_truth(
    :'late_webhook_after_grace'::boolean
    and :'late_cron_after_grace'::boolean
    and (
        select count(*)
        from commerce.order_fulfillments fulfillment
        join commerce.order_settlements settlement
          on settlement.order_id = fulfillment.order_id
        join commerce.financial_exceptions exception
          on exception.order_id = fulfillment.order_id
        where fulfillment.order_id in (
            :late_webhook_order_id,
            :late_cron_order_id
        )
          and fulfillment.status = 'manual_review'
          and fulfillment.carrier_accepted_at = :'late_scan_at'
          and fulfillment.blocking_reason =
              'carrier_acceptance_after_scan_grace'
          and settlement.status = 'manual_review'
          and settlement.manual_review_reason =
              'carrier_acceptance_after_scan_grace'
          and exception.deduplication_key =
              'deadline:fulfillment:' || fulfillment.order_id
          and exception.status = 'open'
          and exception.reason =
              'Carrier acceptance occurred after the immutable scan grace deadline'
          and (exception.details->>'carrierAcceptedAt')::timestamptz =
              :'late_scan_at'
          and (exception.details->>'scanGraceDeadline')::timestamptz =
              :'scan_anchor'
    ) = 2,
    'late carrier evidence depended on webhook/cron ordering'
);

select seed->>'orderId' boundary_order_id,
       seed->>'publicId' boundary_public_id
from (
    select pg_temp.seed_carrier_truth_case(
        'scan-boundary',
        :'scan_anchor'
    ) seed
) seeded
\gset

select webhook->>'carrierAcceptanceAfterScanGrace'
           as boundary_after_grace
from (
    select commerce.record_order_fulfillment_projection(
        :'boundary_public_id',
        'delivery:scan:boundary',
        'carrier_accepted',
        :'scan_webhook_at',
        'shipment-scan-boundary',
        null,
        :'scan_anchor',
        null
    ) webhook
) projected
\gset

select pg_temp.assert_carrier_truth(
    :'boundary_after_grace'::boolean is false
    and exists (
        select 1
        from commerce.order_fulfillments fulfillment
        join commerce.order_settlements settlement
          on settlement.order_id = fulfillment.order_id
        where fulfillment.order_id = :boundary_order_id
          and fulfillment.status = 'carrier_accepted'
          and fulfillment.blocking_reason is null
          and settlement.status = 'held'
    ),
    'carrier acceptance at the exact scan-grace boundary was treated as late'
);

select pg_temp.assert_carrier_truth(
    (commerce.process_due_order_deadlines(
        'carrier-truth:final-replay',
        25
    )->>'processed')::integer = 0,
    'deadline replay changed a terminal carrier-truth decision'
);
