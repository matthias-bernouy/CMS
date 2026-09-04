create or replace function commerce_negotiation.project_proposal(
    p_proposal commerce_negotiation.proposals
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select to_jsonb(p_proposal) || jsonb_build_object(
        'checkout_status',
        case
            when agreement.id is null then null
            when agreement.status = 'active' and agreement.expires_at <= now() then 'expired'
            else agreement.status
        end,
        'agreement_version', agreement.authority_version,
        'commerce_order_public_id', order_row.public_id,
        'agreement_consumed_at', agreement.consumed_at
    )
    from (select 1) singleton
    left join commerce.price_agreements agreement
        on agreement.public_id = p_proposal.commerce_agreement_id
    left join commerce.orders order_row
        on order_row.id = agreement.order_id;
$$;

revoke execute on function commerce_negotiation.project_proposal(
    commerce_negotiation.proposals
) from public, anon, authenticated;
