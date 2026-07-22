

create or replace function commerce.attach_marketplace_claim_evidence(
    p_claim_id bigint,
    p_submitted_by_kind text,
    p_submitted_by text,
    p_storage_bucket text,
    p_storage_path text,
    p_mime_type text,
    p_file_size bigint,
    p_original_filename text,
    p_sha256 text,
    p_description text default null,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_claim commerce.marketplace_claims%rowtype;
    v_evidence commerce.marketplace_claim_evidence%rowtype;
begin
    select * into v_claim from commerce.marketplace_claims where id = p_claim_id for update;
    if not found then raise exception 'not_found: claim'; end if;
    if v_claim.status in ('resolved_buyer', 'resolved_seller', 'resolved_split') then
        raise exception 'conflict: resolved claim no longer accepts evidence';
    end if;
    if p_submitted_by_kind = 'buyer' then
        if v_claim.buyer_cms_user_id is distinct from p_submitted_by then
            raise exception 'not_found: claim';
        end if;
    elsif p_submitted_by_kind = 'seller' then
        if not exists (
            select 1 from commerce.sellers seller
            where seller.id = v_claim.seller_id and seller.cms_user_id = p_submitted_by
        ) then raise exception 'not_found: claim'; end if;
    else
        raise exception 'forbidden: claim evidence actor is not allowed';
    end if;
    if p_storage_bucket <> 'commerce-claim-evidence'
        or p_storage_path !~ ('^claims/' || v_claim.public_id::text || '/(buyer|seller)/[A-Za-z0-9._-]+$') then
        raise exception 'validation: invalid claim evidence storage location';
    end if;
    insert into commerce.marketplace_claim_evidence (
        claim_id, submitted_by_kind, submitted_by, storage_bucket, storage_path,
        mime_type, file_size, original_filename, sha256, description, metadata
    ) values (
        v_claim.id, p_submitted_by_kind, p_submitted_by, p_storage_bucket, p_storage_path,
        p_mime_type, p_file_size, p_original_filename, p_sha256, nullif(btrim(p_description), ''),
        coalesce(p_metadata, '{}'::jsonb)
    ) returning * into v_evidence;
    insert into commerce.marketplace_claim_events (
        claim_id, event_type, actor_kind, actor_id, message, data
    ) values (
        v_claim.id, 'evidence_submitted', p_submitted_by_kind, p_submitted_by,
        nullif(btrim(p_description), ''),
        jsonb_build_object('evidenceId', v_evidence.id, 'mimeType', v_evidence.mime_type,
            'fileSize', v_evidence.file_size, 'sha256', v_evidence.sha256)
    );
    return jsonb_build_object(
        'id', v_evidence.id, 'claimId', v_evidence.claim_id,
        'submittedByKind', v_evidence.submitted_by_kind,
        'mimeType', v_evidence.mime_type, 'fileSize', v_evidence.file_size,
        'originalFilename', v_evidence.original_filename, 'sha256', v_evidence.sha256,
        'description', v_evidence.description, 'metadata', v_evidence.metadata,
        'createdAt', v_evidence.created_at
    );
end;
$$;