set role service_role;

insert into sales_configurator_test.results (name, body)
values (
    'share_primary',
    sales_configurator.create_partner_proposal_share(
        'partner-a',
        sales_configurator_test.id('publish_initial', array['proposal', 'id']),
        pg_catalog.clock_timestamp() + interval '1 day',
        pg_catalog.repeat('a', 64)
    )
);

select sales_configurator_test.assert_true(
    (
        select result.body ->> 'state' = 'ok'
          and result.body #>> '{proposal,status}' = 'shared'
          and result.body #>> '{share,viewCount}' = '0'
          and result.body::text not like '%' || pg_catalog.repeat('a', 64) || '%'
        from sales_configurator_test.results result
        where result.name = 'share_primary'
    )
    and (
        select share.token_hash = pg_catalog.repeat('a', 64)
        from sales_configurator.proposal_shares share
        where share.id = sales_configurator_test.id(
            'share_primary',
            array['share', 'id']
        )
    ),
    'share creation must persist only the digest and never project it'
);

insert into sales_configurator_test.results (name, body)
values
    (
        'public_first_view',
        sales_configurator.read_shared_proposal(pg_catalog.repeat('a', 64))
    ),
    (
        'public_second_view',
        sales_configurator.read_shared_proposal(pg_catalog.repeat('a', 64))
    );

select sales_configurator_test.assert_true(
    (
        select result.body ->> 'state' = 'ok'
          and result.body #>> '{proposal,status}' = 'viewed'
          and not ((result.body -> 'proposal') ? 'privateNotes')
          and not ((result.body -> 'proposal') ? 'client')
          and result.body::text not like '%private-a%'
          and result.body #>> '{proposal,version,salesContact,displayName}' = 'Partner A'
          and result.body #>> '{proposal,version,items,0,depth}' = '0'
          and pg_catalog.jsonb_path_exists(
              result.body #> '{proposal,version,items}',
              '$[*] ? (@.depth == 2)'
          )
          and pg_catalog.jsonb_array_length(
              result.body #> '{proposal,version,items}'
          ) = 7
        from sales_configurator_test.results result
        where result.name = 'public_first_view'
    ),
    'public reads must expose only the frozen public projection'
);

select sales_configurator_test.assert_true(
    (
        select share.view_count = 2
          and share.first_viewed_at is not null
          and share.last_viewed_at >= share.first_viewed_at
        from sales_configurator.proposal_shares share
        where share.id = sales_configurator_test.id(
            'share_primary',
            array['share', 'id']
        )
    )
    and (
        select pg_catalog.count(*) = 1
        from sales_configurator.proposal_events event
        where event.share_id = sales_configurator_test.id(
            'share_primary',
            array['share', 'id']
        )
          and event.event_type = 'viewed'
    ),
    'every read must increment counters but only the first must append a view event'
);

insert into sales_configurator_test.results (name, body)
values (
    'revoke_primary',
    sales_configurator.revoke_partner_proposal_share(
        'partner-a',
        sales_configurator_test.id('publish_initial', array['proposal', 'id']),
        sales_configurator_test.id('share_primary', array['share', 'id'])
    )
);

select sales_configurator_test.assert_true(
    (
        select result.body ->> 'revoked' = 'true'
          and result.body #>> '{proposal,status}' = 'draft'
          and result.body #> '{share,revokedAt}' is not null
        from sales_configurator_test.results result
        where result.name = 'revoke_primary'
    )
    and (
        sales_configurator.read_shared_proposal(
            pg_catalog.repeat('a', 64)
        ) ->> 'state'
    ) = 'unavailable'
    and (
        sales_configurator.read_shared_proposal('invalid-token') ->> 'state'
    ) = 'unavailable',
    'revoked and malformed tokens must be uniformly unavailable'
);

insert into sales_configurator_test.results (name, body)
values (
    'share_for_supersession',
    sales_configurator.create_partner_proposal_share(
        'partner-a',
        sales_configurator_test.id('publish_initial', array['proposal', 'id']),
        null,
        pg_catalog.repeat('c', 64)
    )
);

insert into sales_configurator_test.results (name, body)
values (
    'draft_replacement',
    sales_configurator.save_partner_proposal_draft(
        'partner-a',
        sales_configurator_test.id('publish_initial', array['proposal', 'id']),
        sales_configurator_test.id('client_a', array['client', 'id']),
        '{"title":"Restaurant proposal v2","privateNotes":"private-v2"}',
        pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
                'variantItemId',
                sales_configurator_test.id(
                    'variant_restaurant',
                    array['variant', 'id']
                ),
                'optionalFeatureItemIds',
                pg_catalog.jsonb_build_array(
                    sales_configurator_test.id(
                        'feature_payment',
                        array['feature', 'id']
                    )
                )
            ),
            pg_catalog.jsonb_build_object(
                'variantItemId',
                sales_configurator_test.id(
                    'variant_payment',
                    array['variant', 'id']
                ),
                'optionalFeatureItemIds',
                '[]'::jsonb
            )
        ),
        '[]'::jsonb
    )
);

insert into sales_configurator_test.results (name, body)
values (
    'publish_replacement',
    sales_configurator.publish_partner_proposal(
        'partner-a',
        sales_configurator_test.id('draft_replacement', array['proposal', 'id']),
        sales_configurator_test.id(
            'draft_replacement',
            array['proposal', 'draftVersion', 'id']
        ),
        1
    )
);

reset role;

select sales_configurator_test.assert_true(
    (
        select old_version.state = 'superseded'
        from sales_configurator.proposal_versions old_version
        where old_version.id = sales_configurator_test.id(
            'publish_initial',
            array['proposal', 'publishedVersion', 'id']
        )
    )
    and (
        select share.revoked_at is not null
        from sales_configurator.proposal_shares share
        where share.id = sales_configurator_test.id(
            'share_for_supersession',
            array['share', 'id']
        )
    )
    and exists (
        select 1
        from sales_configurator.proposal_events event
        where event.share_id = sales_configurator_test.id(
            'share_for_supersession',
            array['share', 'id']
        )
          and event.event_type = 'share_revoked'
          and event.metadata ->> 'reason' = 'version_superseded'
    )
    and (
        select result.body #>> '{proposal,publishedVersion,state}' = 'published'
          and result.body #>> '{proposal,publishedVersion,revision}' = '1'
        from sales_configurator_test.results result
        where result.name = 'publish_replacement'
    ),
    'publishing a replacement must supersede the old snapshot and revoke its links'
);

select sales_configurator_test.assert_true(
    (
        sales_configurator.read_shared_proposal(
            pg_catalog.repeat('c', 64)
        ) ->> 'state'
    ) = 'unavailable',
    'a superseded version must never remain publicly readable'
);

do $append_only_history$
declare
    v_share_id bigint := sales_configurator_test.id(
        'share_primary',
        array['share', 'id']
    );
    v_event_id bigint;
begin
    select event.id
    into strict v_event_id
    from sales_configurator.proposal_events event
    where event.share_id = v_share_id
    order by event.id
    limit 1;

    begin
        update sales_configurator.proposal_shares
        set revoked_at = null
        where id = v_share_id;
        raise exception 'expected irreversible revocation rejection';
    exception when others then
        if sqlerrm = 'expected irreversible revocation rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: proposal share revocation cannot be reversed'
            ) = 0
        then
            raise;
        end if;
    end;

    begin
        delete from sales_configurator.proposal_events
        where id = v_event_id;
        raise exception 'expected append-only event rejection';
    exception when others then
        if sqlerrm = 'expected append-only event rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: proposal events are append-only'
            ) = 0
        then
            raise;
        end if;
    end;
end;
$append_only_history$;
