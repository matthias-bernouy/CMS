-- Refresh lifecycle notification rules and private producers without replaying historical events.
-- Source: install/sql/foundation/notifications/activity/rules.sql
alter table commerce.notification_rules no force row level security;
insert into commerce.notification_rules (
    key, event_type, audience, label, description, policy, template_key, stale_policy
) values
    ('commerce.admin.offer.submitted', 'commerce.admin.offer.submitted', 'admin', 'Product offer submitted', 'A seller submitted a product offer for review.', 'required', 'commerce.admin.offer.submitted', 'always_send'),
    ('commerce.admin.offer.price_submitted', 'commerce.admin.offer.price_submitted', 'admin', 'Product offer price submitted', 'A seller submitted a price for a product offer.', 'required', 'commerce.admin.offer.price_submitted', 'always_send'),
    ('commerce.seller.offer.price_requested', 'commerce.seller.offer.price_requested', 'seller', 'Price requested', 'An administrator requested a price for your product offer.', 'required', 'commerce.seller.offer.price_requested', 'always_send'),
    ('commerce.seller.offer.changes_requested', 'commerce.seller.offer.changes_requested', 'seller', 'Changes requested', 'An administrator requested changes to your product offer.', 'required', 'commerce.seller.offer.changes_requested', 'always_send'),
    ('commerce.seller.offer.approved', 'commerce.seller.offer.approved', 'seller', 'Product offer approved', 'Your product offer and its price have been approved.', 'required', 'commerce.seller.offer.approved', 'always_send'),
    ('commerce.seller.offer.rejected', 'commerce.seller.offer.rejected', 'seller', 'Product offer rejected', 'Your product offer was rejected. Open your account to review the decision.', 'required', 'commerce.seller.offer.rejected', 'always_send'),
    ('commerce.seller.proposal.received', 'commerce.seller.proposal.received', 'seller', 'New price proposal', 'A buyer made a price proposal for your product offer.', 'required', 'commerce.seller.proposal.received', 'always_send'),
    ('commerce.buyer.proposal.rejected', 'commerce.buyer.proposal.rejected', 'buyer', 'Price proposal rejected', 'The seller rejected your price proposal.', 'required', 'commerce.buyer.proposal.rejected', 'always_send'),
    ('commerce.seller.proposal.withdrawn', 'commerce.seller.proposal.withdrawn', 'seller', 'Price proposal withdrawn', 'The buyer withdrew their price proposal.', 'required', 'commerce.seller.proposal.withdrawn', 'always_send'),
    ('commerce.buyer.proposal.expired', 'commerce.buyer.proposal.expired', 'buyer', 'Price proposal expired', 'Your price proposal or its payment window has expired.', 'required', 'commerce.buyer.proposal.expired', 'always_send'),
    ('commerce.seller.proposal.expired', 'commerce.seller.proposal.expired', 'seller', 'Price proposal expired', 'A price proposal or its payment window has expired.', 'required', 'commerce.seller.proposal.expired', 'always_send'),
    ('commerce.buyer.proposal.superseded', 'commerce.buyer.proposal.superseded', 'buyer', 'Another proposal accepted', 'The seller accepted another proposal for this product offer.', 'required', 'commerce.buyer.proposal.superseded', 'always_send'),
    ('commerce.buyer.proposal.canceled', 'commerce.buyer.proposal.canceled', 'buyer', 'Price proposal canceled', 'An administrator canceled your price proposal.', 'required', 'commerce.buyer.proposal.canceled', 'always_send'),
    ('commerce.seller.proposal.canceled', 'commerce.seller.proposal.canceled', 'seller', 'Price proposal canceled', 'An administrator canceled a price proposal for your product offer.', 'required', 'commerce.seller.proposal.canceled', 'always_send')
on conflict (key) do update set
    event_type = excluded.event_type,
    audience = excluded.audience,
    label = excluded.label,
    description = excluded.description,
    policy = excluded.policy,
    template_key = excluded.template_key,
    stale_policy = excluded.stale_policy,
    updated_at = now();
alter table commerce.notification_rules force row level security;

-- Source: install/sql/foundation/notifications/activity/enqueue.sql
-- Shared private notification contract for offer and proposal lifecycle producers.
create or replace function commerce.enqueue_marketplace_notification(
    p_event_type text,
    p_source_event_id bigint,
    p_aggregate_type text,
    p_aggregate_id bigint,
    p_occurred_at timestamptz,
    p_context jsonb,
    p_recipient_ids text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_event_id bigint;
    v_key text := p_event_type || ':' || p_aggregate_type || ':' || p_source_event_id;
begin
    if coalesce((select mode from commerce.notification_configuration where id = 'default'), 'builtin') = 'disabled' then
        return;
    end if;
    if p_aggregate_type not in ('offer', 'proposal') or p_source_event_id <= 0
       or p_aggregate_id <= 0 or jsonb_typeof(p_context) is distinct from 'object' then
        raise exception 'validation: invalid marketplace notification context';
    end if;
    insert into commerce.notification_events (
        event_key, event_type, aggregate_type, aggregate_id,
        aggregate_version, occurred_at, payload
    ) values (
        v_key, p_event_type, p_aggregate_type, p_aggregate_id::text,
        p_source_event_id, p_occurred_at, jsonb_build_object('context', p_context)
    ) on conflict (event_key) do nothing returning id into v_event_id;
    if v_event_id is null then
        select id into v_event_id from commerce.notification_events where event_key = v_key;
    end if;
    insert into commerce.notification_deliveries (
        event_id, rule_key, recipient_cms_user_id, recipient_role
    )
    select distinct v_event_id, rule.key, btrim(recipient.id), rule.audience
    from commerce.notification_rules rule
    join commerce.notification_configuration configuration on configuration.id = 'default'
    cross join lateral unnest(case
        when rule.audience = 'admin' then configuration.admin_recipient_cms_user_ids
        else p_recipient_ids
    end) recipient(id)
    where rule.event_type = p_event_type and rule.enabled
      and nullif(btrim(recipient.id), '') is not null
    on conflict (event_id, rule_key, recipient_cms_user_id, channel) do nothing;
end;
$$;

revoke execute on function commerce.enqueue_marketplace_notification(text, bigint, text, bigint, timestamptz, jsonb, text[])
    from public, anon, authenticated;
grant execute on function commerce.enqueue_marketplace_notification(text, bigint, text, bigint, timestamptz, jsonb, text[])
    to service_role;

-- Source: install/sql/foundation/notifications/activity/capture-offer.sql
create or replace function commerce.capture_offer_notification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_offer commerce.offers%rowtype;
    v_recipient text;
    v_type text;
    v_types text[] := '{}';
    v_ready boolean;
    v_was_ready boolean;
    v_context jsonb;
begin
    select * into strict v_offer from commerce.offers where id = new.offer_id;
    select cms_user_id into v_recipient from commerce.sellers where id = v_offer.seller_id;
    select exists(select 1 from commerce.offer_workflow_states
        where code = new.next_workflow_state and phase = 'ready') into v_ready;
    select exists(select 1 from commerce.offer_workflow_states
        where code = new.previous_workflow_state and phase = 'ready') into v_was_ready;
    v_type := case new.event_type
        when 'submitted' then 'commerce.admin.offer.submitted'
        when 'price_submitted' then 'commerce.admin.offer.price_submitted'
        when 'request_price' then 'commerce.seller.offer.price_requested'
        when 'request_changes' then 'commerce.seller.offer.changes_requested'
        when 'reject' then 'commerce.seller.offer.rejected'
        else null
    end;
    if v_type is not null then
        v_types := array_append(v_types, v_type);
    end if;
    -- Publishing an already approved offer must not repeat its approval email.
    if v_ready and not v_was_ready then
        v_types := array_append(v_types, 'commerce.seller.offer.approved');
    end if;
    foreach v_type in array v_types loop
        v_context := jsonb_build_object(
            'offer', jsonb_build_object('id', v_offer.id, 'slug', v_offer.slug, 'title', v_offer.title),
            'action', jsonb_build_object('path', case
                when v_type like 'commerce.admin.%' then '/.cms/admin'
                else '/account/offers?offerId=' || v_offer.id::text
            end)
        );
        perform commerce.enqueue_marketplace_notification(
            v_type, new.id, 'offer', v_offer.id, new.created_at, v_context, array[v_recipient]
        );
    end loop;
    return new;
end;
$$;

revoke execute on function commerce.capture_offer_notification() from public, anon, authenticated;
grant execute on function commerce.capture_offer_notification() to service_role;
drop trigger if exists commerce_capture_offer_notification on commerce.offer_events;
create trigger commerce_capture_offer_notification
after insert on commerce.offer_events
for each row execute function commerce.capture_offer_notification();

-- Source: install/sql/foundation/notifications/claim.sql
create or replace function commerce.claim_notifications(
    p_run_key text,
    p_limit integer default 10,
    p_consumer_mode text default 'builtin'
)
returns table (
    delivery_id uuid,
    recipient_cms_user_id text,
    template_key text,
    idempotency_key text,
    context jsonb
)
language plpgsql
set search_path = ''
as $$
begin
    if p_run_key is null or length(btrim(p_run_key)) = 0 then
        raise exception 'validation: notification run key is required';
    end if;
    if p_limit < 1 or p_limit > 50 then
        raise exception 'validation: notification claim limit must be between 1 and 50';
    end if;
    if p_consumer_mode not in ('builtin', 'external') then
        raise exception 'validation: notification consumer mode must be builtin or external';
    end if;
    if not exists (
        select 1
        from commerce.notification_configuration configuration
        where configuration.id = 'default' and configuration.mode = p_consumer_mode
    ) then
        return;
    end if;

    update commerce.notification_deliveries
    set status = 'retry', claimed_by = null, claim_expires_at = null, available_at = now()
    where status = 'processing' and claim_expires_at <= now();

    update commerce.notification_deliveries delivery
    set status = 'suppressed', claimed_by = null, claim_expires_at = null, updated_at = now()
    from commerce.notification_rules rule
    where delivery.rule_key = rule.key
      and delivery.status in ('pending', 'retry')
      and (
          not rule.enabled
          or case rule.policy
              when 'required' then false
              when 'default_on' then coalesce((
                  select preference.enabled
                  from commerce.notification_user_preferences preference
                  where preference.cms_user_id = delivery.recipient_cms_user_id
                    and preference.rule_key = delivery.rule_key
              ), true) = false
              when 'opt_in' then coalesce((
                  select preference.enabled
                  from commerce.notification_user_preferences preference
                  where preference.cms_user_id = delivery.recipient_cms_user_id
                    and preference.rule_key = delivery.rule_key
              ), false) = false
          end
      );

    update commerce.notification_deliveries delivery
    set status = 'suppressed', last_error = 'superseded by a newer aggregate event', updated_at = now()
    from commerce.notification_events event, commerce.notification_rules rule
    where delivery.event_id = event.id
      and delivery.rule_key = rule.key
      and delivery.status in ('pending', 'retry')
      and rule.stale_policy = 'drop_if_superseded'
      and exists (
          select 1
          from commerce.notification_events newer
          where newer.aggregate_type = event.aggregate_type
            and newer.aggregate_id = event.aggregate_id
            and newer.aggregate_version > event.aggregate_version
            and newer.event_type like 'commerce.order.fulfillment.%'
      );

    update commerce.notification_deliveries delivery
    set status = 'suppressed',
        last_error = 'shipment no longer requires seller handoff',
        updated_at = now()
    from commerce.notification_events event
    where delivery.event_id = event.id
      and delivery.rule_key = 'commerce.seller.sale.shipment_reminder'
      and delivery.status in ('pending', 'retry')
      and not exists (
          select 1
          from commerce.orders orders
          join commerce.order_fulfillments fulfillment on fulfillment.order_id = orders.id
          where orders.id = event.aggregate_id::bigint
            and orders.status = 'active'
            and fulfillment.status in ('awaiting_shipment', 'shipment_creating', 'label_created')
            and fulfillment.seller_handoff_declared_at is null
            and fulfillment.carrier_accepted_at is null
            and fulfillment.seller_handoff_deadline > now()
      );

    return query
    with candidates as (
        select delivery.id
        from commerce.notification_deliveries delivery
        where delivery.status in ('pending', 'retry')
          and delivery.available_at <= now()
        order by delivery.available_at, delivery.created_at, delivery.id
        for update skip locked
        limit p_limit
    ),
    claimed as (
        update commerce.notification_deliveries delivery
        set status = 'processing',
            attempts = delivery.attempts + 1,
            claimed_by = p_run_key,
            claim_expires_at = now() + interval '5 minutes',
            updated_at = now()
        from candidates
        where delivery.id = candidates.id
        returning delivery.*
    )
    select
        claimed.id,
        claimed.recipient_cms_user_id,
        rule.template_key,
        'commerce-notification:' || claimed.id,
        jsonb_build_object(
            'contractVersion', event.contract_version,
            'event', jsonb_build_object(
                'type', event.event_type,
                'occurredAt', event.occurred_at
            ),
            'recipient', jsonb_build_object(
                'userId', claimed.recipient_cms_user_id,
                'role', claimed.recipient_role
            ),
            'delivery', jsonb_build_object(
                'status', coalesce(
                    event.payload->>'sourceEventType',
                    case
                    when event.aggregate_type = 'price_agreement' then 'accepted'
                    else split_part(event.event_type, '.', 4)
                    end
                ),
                'label', rule.label
            ),
            'source', event.payload
        ) || case event.aggregate_type
            when 'offer' then event.payload->'context'
            when 'proposal' then event.payload->'context'
            when 'price_agreement' then jsonb_build_object(
                'agreement', jsonb_build_object(
                    'id', agreement.public_id,
                    'version', agreement.authority_version,
                    'status', case
                        when agreement.status = 'active' and agreement.expires_at <= now() then 'expired'
                        else agreement.status
                    end,
                    'unitAmountMinor', agreement.unit_amount,
                    'quantity', agreement.quantity,
                    'subtotalAmountMinor', agreement.unit_amount::numeric * agreement.quantity,
                    'subtotalAmountFormatted',
                        ((agreement.unit_amount::numeric * agreement.quantity) / 100)::numeric(20, 2)::text
                            || ' '
                            || upper(agreement.currency),
                    'currency', upper(agreement.currency),
                    'expiresAt', agreement.expires_at
                ),
                'offer', jsonb_build_object(
                    'id', offer.id,
                    'slug', offer.slug,
                    'title', offer.title
                ),
                'action', jsonb_build_object(
                    'path', '/checkout?agreementId=' || agreement.public_id::text
                )
            )
            else jsonb_build_object(
                'order', jsonb_build_object(
                    'id', orders.public_id,
                    'number', orders.order_number,
                    'status', orders.status,
                    'currency', upper(orders.currency),
                    'subtotalAmountMinor', orders.subtotal_amount,
                    'shippingAmountMinor', orders.shipping_amount,
                    'totalAmountMinor', orders.total_amount
                ),
                'fulfillment', case when fulfillment.order_id is null then null
                    else jsonb_build_object(
                        'status', fulfillment.status,
                        'sellerHandoffDeadline', fulfillment.seller_handoff_deadline,
                        'sellerHandoffDeclaredAt', fulfillment.seller_handoff_declared_at,
                        'carrierAcceptedAt', fulfillment.carrier_accepted_at
                    ) end,
                'action', jsonb_build_object(
                    'path', case claimed.recipient_role
                        when 'seller' then '/account/sales?saleId=' || orders.public_id
                        when 'admin' then '/.cms/admin'
                        else '/account/purchases?order=' || orders.public_id
                    end
                )
            ) || case when claim.id is null then '{}'::jsonb else jsonb_build_object(
                'claim', jsonb_build_object(
                    'id', claim.public_id,
                    'status', claim.status,
                    'reason', claim.reason,
                    'sellerResponseByAt', claim.seller_response_by_at,
                    'returnShipByAt', claim.return_ship_by_at,
                    'returnDeliveryStatus', claim.return_delivery_status
                )
            ) end
        end
    from claimed
    join commerce.notification_events event on event.id = claimed.event_id
    join commerce.notification_rules rule on rule.key = claimed.rule_key
    left join commerce.orders orders
        on event.aggregate_type = 'order'
       and orders.id = event.aggregate_id::bigint
    left join commerce.order_fulfillments fulfillment on fulfillment.order_id = orders.id
    left join commerce.marketplace_claims claim on claim.id = case
        when event.payload->>'sourceAggregateType' = 'marketplace_claim'
         and event.payload->>'sourceAggregateId' ~ '^[0-9]+$'
            then (event.payload->>'sourceAggregateId')::bigint
        else null
    end
    left join commerce.price_agreements agreement
        on event.aggregate_type = 'price_agreement'
       and agreement.id = event.aggregate_id::bigint
    left join commerce.offers offer on offer.id = agreement.offer_id
    where orders.id is not null or agreement.id is not null
       or event.aggregate_type in ('offer', 'proposal');
end;
$$;
