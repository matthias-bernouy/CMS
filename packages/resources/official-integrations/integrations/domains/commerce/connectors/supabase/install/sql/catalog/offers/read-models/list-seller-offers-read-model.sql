

create or replace function commerce.list_seller_offers_read_model(
    p_cms_user_id text,
    p_status text default null,
    p_publication_status text default null,
    p_workflow_state text default null,
    p_condition_code text default null,
    p_product_id text default null,
    p_variant_id text default null,
    p_query text default null,
    p_limit integer default 50,
    p_offset bigint default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_seller_id bigint;
    v_status text := coalesce(p_status, 'all');
    v_product_id bigint;
    v_variant_id bigint;
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
    v_offset bigint := greatest(coalesce(p_offset, 0), 0);
    v_workflow_states jsonb := '[]'::jsonb;
    v_archived_codes text[] := array[]::text[];
    v_rejected_codes text[] := array[]::text[];
    v_action_required_codes text[] := array[]::text[];
    v_under_review_codes text[] := array[]::text[];
    v_draft_codes text[] := array[]::text[];
    v_status_codes text[] := array[]::text[];
    v_result jsonb;
begin
    if nullif(btrim(p_cms_user_id), '') is null then
        raise exception 'forbidden: CMS user id is required' using errcode = '42501';
    end if;

    select seller.id
    into v_seller_id
    from commerce.sellers seller
    where seller.cms_user_id = p_cms_user_id
    limit 1;

    if v_seller_id is null then
        return jsonb_build_object(
            'seller_exists', false,
            'status_valid', true,
            'rows', '[]'::jsonb,
            'total', 0,
            'workflow_states', '[]'::jsonb,
            'media', '[]'::jsonb,
            'active_price_proposals', '[]'::jsonb
        );
    end if;

    select
        coalesce(jsonb_agg(jsonb_build_object(
            'code', state.code,
            'label', state.label,
            'phase', state.phase,
            'terminal', state.terminal
        ) order by state.position, state.code), '[]'::jsonb),
        coalesce(array_agg(state.code order by state.position, state.code)
            filter (where state.code = 'archived'), array[]::text[]),
        coalesce(array_agg(state.code order by state.position, state.code)
            filter (where state.terminal and state.code <> 'archived'), array[]::text[]),
        coalesce(array_agg(state.code order by state.position, state.code)
            filter (where state.phase = 'seller_input'), array[]::text[]),
        coalesce(array_agg(state.code order by state.position, state.code)
            filter (where state.phase = 'admin_review'), array[]::text[]),
        coalesce(array_agg(state.code order by state.position, state.code)
            filter (where state.phase in ('draft', 'ready')), array[]::text[])
    into
        v_workflow_states,
        v_archived_codes,
        v_rejected_codes,
        v_action_required_codes,
        v_under_review_codes,
        v_draft_codes
    from commerce.offer_workflow_states state;

    if v_status not in (
        'all', 'online', 'paused', 'archived', 'rejected',
        'action_required', 'under_review', 'draft'
    ) then
        return jsonb_build_object(
            'seller_exists', true,
            'status_valid', false,
            'rows', '[]'::jsonb,
            'total', 0,
            'workflow_states', v_workflow_states,
            'media', '[]'::jsonb,
            'active_price_proposals', '[]'::jsonb
        );
    end if;

    if p_product_id is not null then
        v_product_id := p_product_id::bigint;
    end if;
    if p_variant_id is not null then
        v_variant_id := p_variant_id::bigint;
    end if;

    v_status_codes := case v_status
        when 'rejected' then v_rejected_codes
        when 'action_required' then v_action_required_codes
        when 'under_review' then v_under_review_codes
        when 'draft' then v_draft_codes
        else array[]::text[]
    end;

    with filtered as materialized (
        select offer.id, offer.updated_at
        from commerce.offers offer
        where offer.seller_id = v_seller_id
          and case v_status
              when 'online' then offer.publication_status = 'active'
              when 'paused' then offer.publication_status = 'paused'
              else p_publication_status is null
                or offer.publication_status = p_publication_status
          end
          and case when v_status in ('rejected', 'action_required', 'under_review', 'draft')
              then offer.workflow_state = any(v_status_codes)
              else p_workflow_state is null or offer.workflow_state = p_workflow_state
          end
          and (
              v_status <> 'archived'
              or p_query is not null
              or offer.publication_status = 'archived'
              or offer.workflow_state = any(v_archived_codes)
          )
          and (p_condition_code is null or offer.condition_code = p_condition_code)
          and (v_product_id is null or offer.product_id = v_product_id)
          and (v_variant_id is null or offer.variant_id = v_variant_id)
          and (
              p_query is null
              or offer.title ilike '%' || p_query || '%'
              or offer.slug ilike '%' || p_query || '%'
          )
    ), page_ids as materialized (
        select filtered.id, filtered.updated_at
        from filtered
        order by filtered.updated_at desc, filtered.id desc
        limit v_limit
        offset v_offset
    )
    select jsonb_build_object(
        'seller_exists', true,
        'status_valid', true,
        'rows', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', offer.id,
                'seller_id', offer.seller_id,
                'product_id', offer.product_id,
                'variant_id', offer.variant_id,
                'slug', offer.slug,
                'title', offer.title,
                'description', offer.description,
                'condition_code', offer.condition_code,
                'condition_label', condition.label,
                'publication_status', offer.publication_status,
                'workflow_state', offer.workflow_state,
                'publicly_visible',
                    commerce.get_offer_negotiation_context(offer.id)->>'state' = 'ok',
                'accepted_price_amount', offer.accepted_price_amount,
                'currency', offer.currency,
                'availability', offer.availability,
                'quantity_available', offer.quantity_available,
                'metadata', offer.metadata,
                'version', offer.version,
                'created_at', offer.created_at,
                'updated_at', offer.updated_at
            ) order by page.updated_at desc, page.id desc)
            from page_ids page
            join commerce.offers offer on offer.id = page.id
            left join commerce.offer_conditions condition on condition.code = offer.condition_code
        ), '[]'::jsonb),
        'total', (select count(*) from filtered),
        'workflow_states', v_workflow_states,
        'media', coalesce((
            select jsonb_agg(jsonb_build_object(
                'offer_id', media.offer_id,
                'media_id', media.media_id,
                'sort_order', media.sort_order,
                'is_main', media.is_main,
                'width', stored.width,
                'height', stored.height
            ) order by media.sort_order, media.id)
            from page_ids page
            join commerce.offer_media media on media.offer_id = page.id
            join commerce.media stored
              on stored.id = media.media_id
             and stored.detached_at is null
        ), '[]'::jsonb),
        'active_price_proposals', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', proposal.id,
                'offer_id', proposal.offer_id,
                'amount', proposal.amount,
                'status', proposal.status,
                'created_at', proposal.created_at
            ) order by proposal.created_at desc, proposal.id desc)
            from page_ids page
            join commerce.offer_price_proposals proposal on proposal.offer_id = page.id
            where proposal.status in ('pending', 'accepted')
        ), '[]'::jsonb)
    )
    into v_result;

    return v_result;
end;
$$;
