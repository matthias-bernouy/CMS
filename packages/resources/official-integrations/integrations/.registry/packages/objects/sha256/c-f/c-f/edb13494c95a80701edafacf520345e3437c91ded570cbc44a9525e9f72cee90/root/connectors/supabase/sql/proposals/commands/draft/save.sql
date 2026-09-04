create or replace function sales_configurator.save_partner_proposal_draft(
    p_partner_account_id bigint,
    p_proposal_id bigint,
    p_client_id bigint,
    p_proposal jsonb,
    p_selections jsonb,
    p_custom_items jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_payload jsonb := sales_configurator.require_json_object(p_proposal, 'proposal');
    v_validation jsonb;
    v_prepared jsonb;
    v_totals jsonb;
    v_proposal_id bigint;
    v_version_id bigint;
    v_revision bigint;
begin
    if p_partner_account_id is null then
        raise exception 'validation: partnerAccountId is required';
    end if;

    if not exists (
        select 1
        from sales_configurator.clients client
        where client.id = p_client_id
          and client.partner_account_id = p_partner_account_id
    ) then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;
    if p_proposal_id is not null and not exists (
        select 1
        from sales_configurator.proposals proposal
        where proposal.id = p_proposal_id
          and proposal.partner_account_id = p_partner_account_id
    ) then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;

    v_validation := sales_configurator.validate_draft_selection(
        p_selections,
        p_custom_items
    );
    if v_validation ->> 'state' <> 'ok' then
        return v_validation;
    end if;

    v_prepared := sales_configurator.prepare_partner_proposal_draft(
        p_partner_account_id,
        p_proposal_id,
        p_client_id,
        v_payload
    );
    if v_prepared ->> 'state' <> 'ok' then
        return v_prepared;
    end if;

    v_proposal_id := (v_prepared ->> 'proposalId')::bigint;
    v_version_id := (v_prepared ->> 'versionId')::bigint;
    v_totals := sales_configurator.rebuild_draft_snapshot(
        v_version_id,
        p_selections,
        p_custom_items
    );

    update sales_configurator.proposal_versions version
    set
        currency = 'EUR',
        fixed_total_cents = (v_totals ->> 'fixedTotalCents')::bigint,
        quote_item_count = (v_totals ->> 'quoteItemCount')::integer,
        revision = version.revision + 1
    where version.id = v_version_id
    returning version.revision into v_revision;

    insert into sales_configurator.proposal_events (
        proposal_id,
        proposal_version_id,
        event_type,
        actor_type,
        actor_id,
        metadata
    )
    values (
        v_proposal_id,
        v_version_id,
        'draft_saved',
        'partner',
        p_partner_account_id::text,
        pg_catalog.jsonb_build_object(
            'versionNumber', (v_prepared ->> 'versionNumber')::integer,
            'revision', v_revision,
            'fixedTotalCents', (v_totals ->> 'fixedTotalCents')::bigint,
            'quoteItemCount', (v_totals ->> 'quoteItemCount')::integer
        )
    );

    return sales_configurator.partner_proposal_json(
        v_proposal_id,
        p_partner_account_id
    );
end;
$$;
