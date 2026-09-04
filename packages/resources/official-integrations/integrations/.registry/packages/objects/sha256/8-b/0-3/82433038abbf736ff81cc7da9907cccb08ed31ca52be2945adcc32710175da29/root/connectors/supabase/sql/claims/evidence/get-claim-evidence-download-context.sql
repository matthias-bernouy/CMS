

create or replace function commerce.get_claim_evidence_download_context(
    p_evidence_id bigint,
    p_scope text,
    p_actor_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with context as (
        select evidence.storage_bucket,
            evidence.storage_path,
            evidence.mime_type,
            evidence.claim_id
        from commerce.marketplace_claim_evidence evidence
        where evidence.id = p_evidence_id
    )
    select coalesce((
        select case
            when context.storage_bucket <> 'commerce-claim-evidence'
                then jsonb_build_object('state', 'evidence_not_found')
            when p_scope = 'admin'
                then jsonb_build_object(
                    'state', 'ok',
                    'evidence', jsonb_build_object(
                        'storage_bucket', context.storage_bucket,
                        'storage_path', context.storage_path,
                        'mime_type', context.mime_type
                    )
                )
            when p_actor_id is null or btrim(p_actor_id) = ''
                then jsonb_build_object('state', 'identity_required')
            when exists (
                select 1
                from commerce.marketplace_claims claim
                where claim.id = context.claim_id
                  and claim.status not in (
                      'resolved_buyer', 'resolved_seller', 'resolved_split'
                  )
                  and (
                      (p_scope = 'buyer' and claim.buyer_cms_user_id = p_actor_id)
                      or (
                          p_scope = 'seller'
                          and exists (
                              select 1
                              from commerce.sellers seller
                              where seller.id = claim.seller_id
                                and seller.cms_user_id = p_actor_id
                          )
                      )
                  )
            )
                then jsonb_build_object(
                    'state', 'ok',
                    'evidence', jsonb_build_object(
                        'storage_bucket', context.storage_bucket,
                        'storage_path', context.storage_path,
                        'mime_type', context.mime_type
                    )
                )
            else jsonb_build_object('state', 'claim_not_found')
        end
        from context
    ), jsonb_build_object('state', 'evidence_not_found'));
$$;

revoke execute on function commerce.get_claim_evidence_download_context(bigint, text, text)
from public, anon, authenticated;
grant execute on function commerce.get_claim_evidence_download_context(bigint, text, text)
to service_role;