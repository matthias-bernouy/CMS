create or replace function commerce.application_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with configuration as (
        select
            settings.mode,
            fee.status as fee_status,
            protection.status as protection_status,
            risk.status as risk_status
        from commerce.settings settings
        join commerce.fee_policies fee on fee.id = settings.active_c2c_fee_policy_id
        join commerce.protection_policies protection
          on protection.id = settings.active_c2c_protection_policy_id
        join commerce.seller_risk_policies risk
          on risk.id = settings.active_c2c_seller_risk_policy_id
        where settings.id = 'default'
    ),
    configuration_state as (
        select
            count(*) = 1 as present,
            coalesce(bool_and(
                mode = 'ecommerce'
                or (fee_status = 'published'
                    and protection_status = 'published'
                    and risk_status = 'published')
            ), false) as policies_ready
        from configuration
    ),
    required_states(code) as (
        values
            ('draft'), ('pending_review'), ('changes_requested'), ('awaiting_seller_price'),
            ('awaiting_final_approval'), ('approved'), ('rejected'), ('archived')
    ),
    workflow_state as (
        select count(*) filter (
            where state.code is null or not state.enabled
        )::integer as missing_count
        from required_states required
        left join commerce.offer_workflow_states state on state.code = required.code
    ),
    integrity_state as (
        select count(*)::integer as broken_order_count
        from commerce.orders orders
        left join commerce.order_financial_terms terms on terms.order_id = orders.id
        left join commerce.order_fulfillments fulfillment on fulfillment.order_id = orders.id
        left join commerce.order_settlements settlement on settlement.order_id = orders.id
        where orders.status in ('active', 'completed')
          and (
              terms.order_id is null
              or fulfillment.order_id is null
              or settlement.order_id is null
              or not exists (
                  select 1
                  from commerce.order_payment_attempts payment
                  where payment.order_id = orders.id and payment.status = 'succeeded'
              )
          )
    ),
    worker_state as (
        select
            (
                select count(*)
                from commerce.orders orders
                join commerce.order_financial_terms terms on terms.order_id = orders.id
                where orders.status = 'awaiting_payment' and terms.pay_by_at <= now()
            ) + (
                select count(*)
                from commerce.orders orders
                join commerce.order_fulfillments fulfillment on fulfillment.order_id = orders.id
                where orders.status = 'active'
                  and fulfillment.status in ('awaiting_shipment', 'shipment_creating', 'label_created')
                  and fulfillment.seller_handoff_deadline <= now()
                  and fulfillment.seller_handoff_declared_at is null
            ) + (
                select count(*)
                from commerce.marketplace_claims claim
                where (claim.status = 'awaiting_seller_response' and claim.seller_response_by_at <= now())
                   or (claim.status = 'return_required' and claim.return_ship_by_at <= now())
            ) as overdue_count,
            (
                select count(*)
                from commerce.outbox_events event
                where event.status in ('pending', 'failed') and event.available_at <= now()
            ) as outbox_count
    ),
    delivery_state as (
        select
            count(*) > 0 as configured,
            coalesce(bool_or(checked_at < now() - interval '5 minutes'), false) as stale,
            coalesce(sum(
                pending_projection_count + manual_review_count + tracking_error_count
            ), 0)::integer as issue_count
        from commerce.delivery_reconciliation_health
    ),
    payment_protection_state as (
        select
            count(*) = 1 as present,
            coalesce(bool_or(required_minimum_amount > last_provider_applied_amount), false)
                as underprotected,
            (
                select count(*)::integer
                from commerce.platform_payout_liability_pending_orders
            ) as pending_count
        from commerce.platform_payout_liability_controls
        where control_key = 'default'
    ),
    notification_state as (
        select
            configuration.mode,
            cardinality(configuration.admin_recipient_cms_user_ids) as admin_recipient_count,
            (
                select count(*)
                from commerce.notification_deliveries delivery
                where delivery.status = 'dead_letter'
            ) as dead_letter_count,
            (
                select count(*)
                from commerce.notification_deliveries delivery
                where delivery.status = 'processing' and delivery.claim_expires_at <= now()
            ) as expired_claim_count,
            (
                select count(*)
                from unnest(array[
                    'commerce.order.paid',
                    'commerce.order.refunded',
                    'commerce.seller.sale.paid',
                    'commerce.seller.sale.shipment_reminder',
                    'commerce.admin.financial_exception'
                ]) required(key)
                where not exists (
                    select 1 from commerce.notification_rules rule where rule.key = required.key
                )
            ) as missing_rule_count
        from commerce.notification_configuration configuration
        where configuration.id = 'default'
    ),
    attention_state as (
        select count(*)::integer as item_count
        from commerce.financial_exceptions item
        where item.status <> 'resolved' and item.severity in ('high', 'critical')
    ),
    state as (
        select
            configuration_state.*,
            workflow_state.missing_count,
            integrity_state.broken_order_count,
            worker_state.overdue_count,
            worker_state.outbox_count,
            delivery_state.configured as delivery_configured,
            delivery_state.stale as delivery_stale,
            delivery_state.issue_count as delivery_issue_count,
            payment_protection_state.present as payment_protection_present,
            payment_protection_state.underprotected,
            payment_protection_state.pending_count as payment_protection_pending_count,
            notification_state.mode as notification_mode,
            coalesce(notification_state.admin_recipient_count, 0) as admin_recipient_count,
            coalesce(notification_state.dead_letter_count, 0) as dead_letter_count,
            coalesce(notification_state.expired_claim_count, 0) as expired_claim_count,
            coalesce(notification_state.missing_rule_count, 0) as missing_rule_count,
            attention_state.item_count as attention_count
        from configuration_state
        cross join workflow_state
        cross join integrity_state
        cross join worker_state
        cross join delivery_state
        cross join payment_protection_state
        cross join attention_state
        left join notification_state on true
    )
    select jsonb_build_object(
        'status', case
            when not present or not policies_ready or missing_count > 0
                or not payment_protection_present
                or notification_mode is null or missing_rule_count > 0 then 'blocked'
            when broken_order_count > 0 or overdue_count > 0 or outbox_count > 0
                or dead_letter_count > 0 or expired_claim_count > 0 or attention_count > 0
                or underprotected or payment_protection_pending_count > 0
                or (delivery_configured and (delivery_stale or delivery_issue_count > 0))
                or (notification_mode <> 'disabled' and admin_recipient_count = 0) then 'degraded'
            else 'ready'
        end,
        'checks', jsonb_build_array(
            jsonb_build_object(
                'id', 'database', 'status', 'ok', 'code', 'database_available'
            ),
            jsonb_build_object(
                'id', 'protectedPolicies',
                'status', case when present and policies_ready then 'ok' else 'error' end,
                'code', case when present and policies_ready
                    then 'protected_policies_ready' else 'protected_policies_not_published' end
            ),
            jsonb_build_object(
                'id', 'offerWorkflow',
                'status', case when missing_count = 0 then 'ok' else 'error' end,
                'code', case when missing_count = 0 then 'offer_workflow_ready' else 'offer_workflow_incomplete' end,
                'message', missing_count || ' required workflow states are missing or disabled'
            ),
            jsonb_build_object(
                'id', 'orderIntegrity',
                'status', case when broken_order_count = 0 then 'ok' else 'error' end,
                'code', case when broken_order_count = 0 then 'order_projections_consistent'
                    else 'order_projection_incomplete' end,
                'message', broken_order_count || ' active or completed orders have incomplete projections'
            ),
            jsonb_build_object(
                'id', 'workers',
                'status', case when overdue_count + outbox_count = 0 then 'ok' else 'warning' end,
                'code', case when overdue_count + outbox_count = 0 then 'workers_current'
                    else 'worker_backlog_detected' end,
                'message', overdue_count || ' overdue deadlines and ' || outbox_count || ' due outbox events'
            ),
            jsonb_build_object(
                'id', 'deliveryReconciliation',
                'status', case
                    when delivery_configured and (delivery_stale or delivery_issue_count > 0) then 'warning'
                    else 'ok'
                end,
                'code', case
                    when not delivery_configured then 'delivery_reconciliation_not_configured'
                    when delivery_stale then 'delivery_reconciliation_stale'
                    when delivery_issue_count > 0 then 'delivery_reconciliation_issues_present'
                    else 'delivery_reconciliation_current'
                end,
                'message', delivery_issue_count || ' delivery projection or tracking issues are open'
            ),
            jsonb_build_object(
                'id', 'paymentProtection',
                'status', case
                    when not payment_protection_present then 'error'
                    when underprotected or payment_protection_pending_count > 0 then 'warning'
                    else 'ok'
                end,
                'code', case
                    when not payment_protection_present then 'payment_protection_control_missing'
                    when underprotected then 'payment_provider_minimum_underprotected'
                    when payment_protection_pending_count > 0 then 'payment_protection_reconciliation_pending'
                    else 'payment_protection_current'
                end,
                'message', payment_protection_pending_count || ' payment protection reconciliations are pending'
            ),
            jsonb_build_object(
                'id', 'notifications',
                'status', case
                    when notification_mode is null or missing_rule_count > 0 then 'error'
                    when dead_letter_count + expired_claim_count > 0
                      or (notification_mode <> 'disabled' and admin_recipient_count = 0) then 'warning'
                    else 'ok'
                end,
                'code', case
                    when notification_mode is null then 'notification_configuration_missing'
                    when missing_rule_count > 0 then 'notification_rules_missing'
                    when dead_letter_count > 0 then 'notification_dead_letters_present'
                    when expired_claim_count > 0 then 'notification_claims_expired'
                    when notification_mode <> 'disabled' and admin_recipient_count = 0
                        then 'notification_admin_recipients_missing'
                    else 'notifications_ready'
                end,
                'message', dead_letter_count || ' dead letters and '
                    || expired_claim_count || ' expired delivery claims'
            ),
            jsonb_build_object(
                'id', 'administratorAttention',
                'status', case when attention_count = 0 then 'ok' else 'warning' end,
                'code', case when attention_count = 0 then 'no_financial_exception'
                    else 'financial_exceptions_require_attention' end,
                'message', attention_count || ' high-priority financial exceptions require attention'
            )
        )
    )
    from state;
$$;
