create or replace function commerce_negotiation.get_proposal_media_download_context(
    p_media_id bigint,
    p_user_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_media jsonb;
begin
    if p_media_id is null or p_media_id <= 0 or p_user_id is null or btrim(p_user_id) = '' then
        return jsonb_build_object('state', 'not_found');
    end if;

    if not exists (
        select 1
        from commerce_negotiation.proposals proposal
        where proposal.offer_main_image_media_id = p_media_id
          and p_user_id in (proposal.buyer_cms_user_id, proposal.seller_cms_user_id)
    ) then
        return jsonb_build_object('state', 'not_found');
    end if;

    select jsonb_build_object(
        'id', media.id,
        'storage_bucket', media.storage_bucket,
        'storage_path', media.storage_path,
        'mime_type', media.mime_type
    )
    into v_media
    from commerce.media media
    where media.id = p_media_id
      and media.detached_at is null;

    if not found then
        return jsonb_build_object('state', 'not_found');
    end if;
    return jsonb_build_object('state', 'ok', 'media', v_media);
end;
$$;

revoke execute on function commerce_negotiation.get_proposal_media_download_context(bigint, text)
    from public, anon, authenticated;
grant execute on function commerce_negotiation.get_proposal_media_download_context(bigint, text)
    to service_role;
