set role service_role;

insert into sales_configurator_test.results (name, body)
values (
    'draft_second',
    sales_configurator.save_partner_proposal_draft(
        'partner-a',
        sales_configurator_test.id('draft_initial', array['proposal', 'id']),
        sales_configurator_test.id('client_a', array['client', 'id']),
        '{"title":"Restaurant proposal","private_notes":"private-a"}',
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
        '[{"label":"Custom reporting","quantity":1}]'::jsonb
    )
);

select sales_configurator_test.assert_true(
    sales_configurator_test.id(
        'draft_second',
        array['proposal', 'draftVersion', 'id']
    ) = sales_configurator_test.id(
        'draft_initial',
        array['proposal', 'draftVersion', 'id']
    )
    and (
        select result.body #>> '{proposal,draftVersion,revision}' = '2'
        from sales_configurator_test.results result
        where result.name = 'draft_second'
    ),
    'saving a draft must preserve its identity and advance its revision'
);

insert into sales_configurator_test.results (name, body)
values (
    'publish_stale',
    sales_configurator.publish_partner_proposal(
        'partner-a',
        sales_configurator_test.id('draft_second', array['proposal', 'id']),
        sales_configurator_test.id(
            'draft_second',
            array['proposal', 'draftVersion', 'id']
        ),
        1
    )
);

select sales_configurator_test.assert_true(
    (
        select result.body ->> 'state' = 'conflict'
          and result.body ->> 'code' = 'draft_version_changed'
        from sales_configurator_test.results result
        where result.name = 'publish_stale'
    )
    and (
        select version.state = 'draft' and version.revision = 2
        from sales_configurator.proposal_versions version
        where version.id = sales_configurator_test.id(
            'draft_second',
            array['proposal', 'draftVersion', 'id']
        )
    ),
    'stale publication must be rejected without mutating the draft'
);

insert into sales_configurator_test.results (name, body)
values (
    'publish_initial',
    sales_configurator.publish_partner_proposal(
        'partner-a',
        sales_configurator_test.id('draft_second', array['proposal', 'id']),
        sales_configurator_test.id(
            'draft_second',
            array['proposal', 'draftVersion', 'id']
        ),
        2
    )
);

select sales_configurator_test.assert_true(
    (
        select result.body ->> 'state' = 'ok'
          and result.body #> '{proposal,draftVersion}' = 'null'::jsonb
          and result.body #>> '{proposal,publishedVersion,state}' = 'published'
          and result.body #>> '{proposal,publishedVersion,revision}' = '2'
        from sales_configurator_test.results result
        where result.name = 'publish_initial'
    ),
    'the expected draft revision must publish atomically'
);

select sales_configurator.save_partner_client(
    'partner-a',
    sales_configurator_test.id('client_a', array['client', 'id']),
    '{"company_name":"Bistro A renamed","contact_name":"Alice New","contact_email":"alice-new@example.test"}'
);
select sales_configurator.upsert_partner_account(
    sales_configurator_test.id('partner_a', array['partner', 'id']),
    'partner-a',
    '{"display_name":"Partner A renamed","contact_email":"new-a@example.test","status":"active"}'
);

insert into sales_configurator_test.results (name, body)
values (
    'history_after_live_update',
    sales_configurator.read_partner_proposal(
        'partner-a',
        sales_configurator_test.id('publish_initial', array['proposal', 'id'])
    )
);

select sales_configurator_test.assert_true(
    (
        select result.body #>> '{proposal,client,companyName}' = 'Bistro A renamed'
          and result.body #>> '{proposal,publishedVersion,title}' = 'Restaurant proposal'
          and result.body #>> '{proposal,publishedVersion,clientSnapshot,companyName}' = 'Bistro A'
          and result.body #>> '{proposal,publishedVersion,salesContact,displayName}' = 'Partner A'
        from sales_configurator_test.results result
        where result.name = 'history_after_live_update'
    ),
    'published history must expose frozen client, title, and sales contact snapshots'
);

reset role;

do $published_immutability$
declare
    v_version_id bigint := sales_configurator_test.id(
        'publish_initial',
        array['proposal', 'publishedVersion', 'id']
    );
    v_item_id bigint;
begin
    select item.id
    into strict v_item_id
    from sales_configurator.proposal_items item
    where item.proposal_version_id = v_version_id
    order by item.id
    limit 1;

    begin
        update sales_configurator.proposal_versions
        set public_title = 'Tampered'
        where id = v_version_id;
        raise exception 'expected published version update rejection';
    exception when others then
        if sqlerrm = 'expected published version update rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: published proposal versions cannot be changed'
            ) = 0
        then
            raise;
        end if;
    end;

    begin
        update sales_configurator.proposal_items
        set label = 'Tampered'
        where id = v_item_id;
        raise exception 'expected published item update rejection';
    exception when others then
        if sqlerrm = 'expected published item update rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: published proposal items cannot be changed'
            ) = 0
        then
            raise;
        end if;
    end;

    begin
        delete from sales_configurator.proposal_versions
        where id = v_version_id;
        raise exception 'expected published version delete rejection';
    exception when others then
        if sqlerrm = 'expected published version delete rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: published proposal versions cannot be deleted'
            ) = 0
        then
            raise;
        end if;
    end;
end;
$published_immutability$;
