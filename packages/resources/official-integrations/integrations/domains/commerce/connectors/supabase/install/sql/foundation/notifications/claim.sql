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
            'recipient', jsonb_build_object('userId', claimed.recipient_cms_user_id),
            'delivery', jsonb_build_object(
                'status', case
                    when event.aggregate_type = 'price_agreement' then 'accepted'
                    else split_part(event.event_type, '.', 4)
                end,
                'label', rule.label
            ),
            'source', event.payload
        ) || case event.aggregate_type
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
                'action', jsonb_build_object(
                    'path', '/account/purchases?order=' || orders.public_id
                )
            )
        end
    from claimed
    join commerce.notification_events event on event.id = claimed.event_id
    join commerce.notification_rules rule on rule.key = claimed.rule_key
    left join commerce.orders orders
        on event.aggregate_type = 'order'
       and orders.id = event.aggregate_id::bigint
    left join commerce.price_agreements agreement
        on event.aggregate_type = 'price_agreement'
       and agreement.id = event.aggregate_id::bigint
    left join commerce.offers offer on offer.id = agreement.offer_id
    where orders.id is not null or agreement.id is not null;
end;
$$;
