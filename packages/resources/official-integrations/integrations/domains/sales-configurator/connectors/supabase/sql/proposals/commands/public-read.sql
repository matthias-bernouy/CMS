create or replace function sales_configurator.read_shared_proposal(
    p_token_hash text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_token_hash text := pg_catalog.lower(pg_catalog.btrim(p_token_hash));
    v_share sales_configurator.proposal_shares%rowtype;
    v_version sales_configurator.proposal_versions%rowtype;
    v_proposal sales_configurator.proposals%rowtype;
    v_share_id bigint;
    v_version_id bigint;
    v_proposal_id bigint;
    v_now timestamptz;
    v_is_first_view boolean;
begin
    if v_token_hash is null or v_token_hash !~ '^[0-9a-f]{64}$' then
        return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    select version.proposal_id
    into v_proposal_id
    from sales_configurator.proposal_shares share
    join sales_configurator.proposal_versions version
      on version.id = share.proposal_version_id
    where share.token_hash = v_token_hash
      and share.revoked_at is null
      and (
        share.expires_at is null
        or share.expires_at > pg_catalog.clock_timestamp()
      )
      and version.state = 'published';
    if not found then
        return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    select proposal.*
    into v_proposal
    from sales_configurator.proposals proposal
    where proposal.id = v_proposal_id
      and proposal.status in ('shared', 'viewed')
    for update;
    if not found then
        return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    select share.id, version.id
    into v_share_id, v_version_id
    from sales_configurator.proposal_shares share
    join sales_configurator.proposal_versions version
      on version.id = share.proposal_version_id
    where share.token_hash = v_token_hash
      and share.revoked_at is null
      and (
        share.expires_at is null
        or share.expires_at > pg_catalog.clock_timestamp()
      )
      and version.state = 'published'
      and version.proposal_id = v_proposal.id
    for update of share;

    if not found then
        return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    select share.*
    into strict v_share
    from sales_configurator.proposal_shares share
    where share.id = v_share_id;
    select version.*
    into strict v_version
    from sales_configurator.proposal_versions version
    where version.id = v_version_id;
    v_now := pg_catalog.clock_timestamp();
    if v_share.revoked_at is not null
        or (v_share.expires_at is not null and v_share.expires_at <= v_now)
    then
        return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    v_is_first_view := v_share.view_count = 0;
    update sales_configurator.proposal_shares share
    set
        first_viewed_at = coalesce(share.first_viewed_at, v_now),
        last_viewed_at = v_now,
        view_count = share.view_count + 1
    where share.id = v_share.id
    returning * into v_share;

    if v_proposal.status = 'shared' then
        update sales_configurator.proposals proposal
        set status = 'viewed'
        where proposal.id = v_proposal.id
        returning * into v_proposal;
    end if;

    if v_is_first_view then
        insert into sales_configurator.proposal_events (
            proposal_id,
            proposal_version_id,
            share_id,
            event_type,
            actor_type
        )
        values (
            v_proposal.id,
            v_version.id,
            v_share.id,
            'viewed',
            'client'
        );
    end if;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'proposal', pg_catalog.jsonb_build_object(
            'reference', v_proposal.reference,
            'status', v_proposal.status,
            'title', v_version.public_title,
            'introduction', v_version.public_introduction,
            'version', pg_catalog.jsonb_build_object(
                'publishedAt', v_version.published_at,
                'currency', v_version.currency,
                'fixedTotalCents', v_version.fixed_total_cents,
                'quoteItemCount', v_version.quote_item_count,
                'salesContact', pg_catalog.jsonb_build_object(
                    'displayName', v_version.sales_contact_name,
                    'email', v_version.sales_contact_email
                ),
                'items', sales_configurator.public_proposal_items_json(v_version.id)
            )
        )
    );
end;
$$;
