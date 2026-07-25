create or replace function sales_configurator.proposal_item_json(
    p_item_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', item.id,
        'parentItemId', item.parent_item_id,
        'catalogItemId', item.catalog_item_id,
        'kind', item.kind,
        'origin', item.origin,
        'code', item.code,
        'label', item.label,
        'description', item.description,
        'quantity', item.quantity,
        'pricingMode', item.pricing_mode,
        'unitAmountCents', item.unit_amount_cents,
        'currency', item.currency,
        'sortOrder', item.sort_order
    )
    from sales_configurator.proposal_items item
    where item.id = p_item_id
$$;

create or replace function sales_configurator.proposal_version_items_json(
    p_proposal_version_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    with recursive item_tree as (
        select
            item.id,
            array[item.sort_order::bigint, item.id] as sort_path
        from sales_configurator.proposal_items item
        where item.proposal_version_id = p_proposal_version_id
          and item.parent_item_id is null
        union all
        select
            child.id,
            parent.sort_path || array[child.sort_order::bigint, child.id]
        from sales_configurator.proposal_items child
        join item_tree parent on parent.id = child.parent_item_id
        where child.proposal_version_id = p_proposal_version_id
    )
    select coalesce(
        pg_catalog.jsonb_agg(
            sales_configurator.proposal_item_json(item_tree.id)
            order by item_tree.sort_path
        ),
        '[]'::jsonb
    )
    from item_tree
$$;

create or replace function sales_configurator.partner_proposal_version_json(
    p_proposal_version_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', version.id,
        'versionNumber', version.version_number,
        'revision', version.revision,
        'state', version.state,
        'currency', version.currency,
        'fixedTotalCents', version.fixed_total_cents,
        'quoteItemCount', version.quote_item_count,
        'title', version.public_title,
        'introduction', version.public_introduction,
        'clientSnapshot', pg_catalog.jsonb_build_object(
            'companyName', version.client_company_name,
            'companyRegistrationNumber', version.client_company_registration_number,
            'contactName', version.client_contact_name,
            'contactJobTitle', version.client_contact_job_title,
            'contactEmail', version.client_contact_email,
            'contactPhone', version.client_contact_phone,
            'addressLine1', version.client_address_line1,
            'addressLine2', version.client_address_line2,
            'postalCode', version.client_postal_code,
            'city', version.client_city,
            'country', version.client_country
        ),
        'salesContact', pg_catalog.jsonb_build_object(
            'displayName', version.sales_contact_name,
            'email', version.sales_contact_email
        ),
        'createdAt', version.created_at,
        'publishedAt', version.published_at,
        'items', sales_configurator.proposal_version_items_json(version.id)
    )
    from sales_configurator.proposal_versions version
    where version.id = p_proposal_version_id
$$;

create or replace function sales_configurator.proposal_shares_json(
    p_proposal_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', share.id,
                'proposalVersionId', share.proposal_version_id,
                'expiresAt', share.expires_at,
                'revokedAt', share.revoked_at,
                'firstViewedAt', share.first_viewed_at,
                'lastViewedAt', share.last_viewed_at,
                'viewCount', share.view_count,
                'createdAt', share.created_at
            )
            order by share.created_at desc, share.id desc
        ),
        '[]'::jsonb
    )
    from sales_configurator.proposal_shares share
    join sales_configurator.proposal_versions version
      on version.id = share.proposal_version_id
    where version.proposal_id = p_proposal_id
$$;

create or replace function sales_configurator.proposal_events_json(
    p_proposal_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', event.id,
                'eventType', event.event_type,
                'actorType', event.actor_type,
                'actorId', event.actor_id,
                'metadata', event.metadata,
                'occurredAt', event.occurred_at
            )
            order by event.occurred_at desc, event.id desc
        ),
        '[]'::jsonb
    )
    from sales_configurator.proposal_events event
    where event.proposal_id = p_proposal_id
$$;

create or replace function sales_configurator.partner_proposal_events_json(
    p_proposal_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', event.id,
                'eventType', event.event_type,
                'actorType', event.actor_type,
                'metadata', event.metadata,
                'occurredAt', event.occurred_at
            )
            order by event.occurred_at desc, event.id desc
        ),
        '[]'::jsonb
    )
    from sales_configurator.proposal_events event
    where event.proposal_id = p_proposal_id
$$;
