

do $$
declare v_table text;
begin
    foreach v_table in array array[
        'accounts', 'platform_payout_controls', 'payments', 'payment_lifecycle_guards', 'financial_operations', 'transfers',
        'commerce_projection_outbox', 'commerce_projection_interventions', 'transfer_recovery_requests', 'transfer_reversals', 'seller_recovery_exposures', 'refunds', 'stripe_disputes',
        'irreversible_dispute_action_approvals', 'payout_events'
    ] loop
        execute format('drop trigger if exists %I_set_updated_at on stripe_connect.%I', v_table, v_table);
        execute format(
            'create trigger %I_set_updated_at before update on stripe_connect.%I for each row execute function stripe_connect.set_updated_at()',
            v_table, v_table
        );
    end loop;
end $$;