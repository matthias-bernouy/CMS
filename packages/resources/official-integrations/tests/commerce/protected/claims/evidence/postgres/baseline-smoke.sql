\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir evidence.fixture.sql

create function pg_temp.evidence_keys(p_value jsonb)
returns text[] language sql immutable as $$
    select coalesce(array_agg(key order by key), array[]::text[])
    from jsonb_object_keys(p_value) key;
$$;

do $$
declare
    v_evidence jsonb;
    v_buyer_allowed boolean;
    v_seller_allowed boolean;
    v_resolved_member_allowed boolean;
    v_resolved_admin_allowed boolean;
begin
    select jsonb_build_object(
        'id', evidence.id,
        'claim_id', evidence.claim_id,
        'storage_bucket', evidence.storage_bucket,
        'storage_path', evidence.storage_path,
        'mime_type', evidence.mime_type
    ) into v_evidence
    from commerce.marketplace_claim_evidence evidence
    where evidence.id = 9800000000033;

    select exists (
        select 1
        from commerce.marketplace_claim_evidence evidence
        join commerce.marketplace_claims claim on claim.id = evidence.claim_id
        where evidence.id = 9800000000033
          and claim.status not in ('resolved_buyer', 'resolved_seller', 'resolved_split')
          and claim.buyer_cms_user_id = 'order-read-buyer-a'
    ) into v_buyer_allowed;

    select exists (
        select 1
        from commerce.marketplace_claim_evidence evidence
        join commerce.marketplace_claims claim on claim.id = evidence.claim_id
        join commerce.sellers seller on seller.id = claim.seller_id
        where evidence.id = 9800000000033
          and claim.status not in ('resolved_buyer', 'resolved_seller', 'resolved_split')
          and seller.cms_user_id = 'order-read-seller-17'
    ) into v_seller_allowed;

    select exists (
        select 1
        from commerce.marketplace_claim_evidence evidence
        join commerce.marketplace_claims claim on claim.id = evidence.claim_id
        where evidence.id = 9800000000034
          and claim.status not in ('resolved_buyer', 'resolved_seller', 'resolved_split')
          and claim.buyer_cms_user_id = 'order-read-buyer-b'
    ) into v_resolved_member_allowed;

    select exists (
        select 1 from commerce.marketplace_claim_evidence evidence
        where evidence.id = 9800000000034
    ) into v_resolved_admin_allowed;

    if pg_temp.evidence_keys(v_evidence) <> array[
        'claim_id', 'id', 'mime_type', 'storage_bucket', 'storage_path'
    ] or (v_evidence->>'claim_id')::bigint <> 9800000000007
        or v_evidence->>'storage_bucket' <> 'commerce-claim-evidence'
        or v_evidence->>'mime_type' <> 'application/pdf' then
        raise exception 'claim evidence baseline: bounded file projection changed';
    end if;
    if not v_buyer_allowed or not v_seller_allowed then
        raise exception 'claim evidence baseline: active participant access changed';
    end if;
    if v_resolved_member_allowed or not v_resolved_admin_allowed then
        raise exception 'claim evidence baseline: resolved-claim access changed';
    end if;
    if has_table_privilege('anon', 'commerce.marketplace_claim_evidence', 'select')
        or has_table_privilege('authenticated', 'commerce.marketplace_claim_evidence', 'select')
        or not has_table_privilege('service_role', 'commerce.marketplace_claim_evidence', 'select') then
        raise exception 'claim evidence baseline: table ACL changed';
    end if;
end;
$$;

rollback;
