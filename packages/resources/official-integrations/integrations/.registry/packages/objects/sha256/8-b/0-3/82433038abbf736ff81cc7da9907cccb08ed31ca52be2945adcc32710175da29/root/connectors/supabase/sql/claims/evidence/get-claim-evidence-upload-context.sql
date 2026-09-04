

create or replace function commerce.get_claim_evidence_upload_context(
    p_claim_id bigint,
    p_actor_kind text,
    p_actor_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce((
        select jsonb_build_object(
            'state', 'ok',
            'public_id', claim.public_id
        )
        from commerce.marketplace_claims claim
        where claim.id = p_claim_id
          and claim.status not in ('resolved_buyer', 'resolved_seller', 'resolved_split')
          and (
              (p_actor_kind = 'buyer' and claim.buyer_cms_user_id = p_actor_id)
              or (
                  p_actor_kind = 'seller'
                  and exists (
                      select 1
                      from commerce.sellers seller
                      where seller.id = claim.seller_id
                        and seller.cms_user_id = p_actor_id
                  )
              )
          )
    ), jsonb_build_object('state', 'not_found'));
$$;

revoke execute on function commerce.get_claim_evidence_upload_context(bigint, text, text)
from public, anon, authenticated;
grant execute on function commerce.get_claim_evidence_upload_context(bigint, text, text)
to service_role;