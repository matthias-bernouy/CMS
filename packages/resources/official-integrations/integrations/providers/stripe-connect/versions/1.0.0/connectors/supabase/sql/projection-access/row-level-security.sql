

do $$
declare v_table text;
begin
    foreach v_table in array array[
        'accounts', 'marketplace_terms_versions', 'marketplace_terms_configuration', 'marketplace_terms_acceptances', 'platform_payout_controls', 'payments', 'payment_lifecycle_guards', 'payment_events', 'financial_operations',
        'commerce_projection_outbox', 'commerce_projection_interventions', 'transfers', 'transfer_recovery_requests', 'transfer_reversals', 'seller_recovery_exposures', 'refunds', 'stripe_disputes',
        'stripe_dispute_evidence', 'irreversible_dispute_action_approvals',
        'stripe_events', 'payout_events',
        'reconciliation_runs', 'provider_exceptions'
    ] loop
        execute format('alter table stripe_connect.%I enable row level security', v_table);
        execute format('alter table stripe_connect.%I force row level security', v_table);
    end loop;
end $$;
