set role service_role;

select sales_configurator_test.assert_true(
    (
        sales_configurator.save_partner_client(
            'partner-b',
            sales_configurator_test.id('client_a', array['client', 'id']),
            '{"company_name":"Stolen"}'
        ) ->> 'state'
    ) = 'not_found',
    'partner B must not update partner A client'
);

select sales_configurator_test.assert_true(
    (
        sales_configurator.read_partner_proposal(
            'partner-b',
            sales_configurator_test.id(
                'draft_initial',
                array['proposal', 'id']
            )
        ) ->> 'state'
    ) = 'not_found',
    'cross-partner proposal reads must be indistinguishable from missing'
);

select sales_configurator_test.assert_true(
    (
        sales_configurator.save_partner_proposal_draft(
            'partner-b',
            sales_configurator_test.id(
                'draft_initial',
                array['proposal', 'id']
            ),
            sales_configurator_test.id('client_b', array['client', 'id']),
            '{"title":"Stolen"}',
            '{"invalid":"selection-shape"}'::jsonb,
            '[]'::jsonb
        ) ->> 'state'
    ) = 'not_found',
    'ownership must be checked before catalogue payload validation'
);

select sales_configurator_test.assert_true(
    (
        sales_configurator.publish_partner_proposal(
            'partner-b',
            sales_configurator_test.id(
                'draft_initial',
                array['proposal', 'id']
            ),
            sales_configurator_test.id(
                'draft_initial',
                array['proposal', 'draftVersion', 'id']
            ),
            1
        ) ->> 'state'
    ) = 'not_found',
    'partner B must not publish partner A proposal'
);

select sales_configurator_test.assert_true(
    (
        sales_configurator.create_partner_proposal_share(
            'partner-b',
            sales_configurator_test.id(
                'draft_initial',
                array['proposal', 'id']
            ),
            null,
            pg_catalog.repeat('b', 64)
        ) ->> 'state'
    ) = 'not_found',
    'partner B must not share partner A proposal'
);

select sales_configurator_test.assert_true(
    (
        sales_configurator.revoke_partner_proposal_share(
            'partner-b',
            sales_configurator_test.id(
                'draft_initial',
                array['proposal', 'id']
            ),
            999999
        ) ->> 'state'
    ) = 'not_found',
    'partner B must not revoke partner A shares'
);

reset role;

do $partner_identity_and_status$
declare
    v_partner_b_id bigint := sales_configurator_test.id(
        'partner_b',
        array['partner', 'id']
    );
begin
    begin
        perform sales_configurator.upsert_partner_account(
            v_partner_b_id,
            'partner-b-reassigned',
            '{"display_name":"Partner B"}'
        );
        raise exception 'expected immutable CMS identity rejection';
    exception when others then
        if sqlerrm = 'expected immutable CMS identity rejection'
            or pg_catalog.strpos(sqlerrm, 'cmsUserId is immutable') = 0
        then
            raise;
        end if;
    end;

    perform sales_configurator.upsert_partner_account(
        v_partner_b_id,
        'partner-b',
        '{"display_name":"Partner B","status":"suspended"}'
    );
    begin
        perform sales_configurator.save_partner_client(
            'partner-b',
            null,
            '{"company_name":"Denied","contact_name":"Bob","contact_email":"b@example.test"}'
        );
        raise exception 'expected suspended partner rejection';
    exception when sqlstate '42501' then
        null;
    end;
    perform sales_configurator.upsert_partner_account(
        v_partner_b_id,
        'partner-b',
        '{"display_name":"Partner B","status":"active"}'
    );
end;
$partner_identity_and_status$;

do $owned_rows_are_immutable$
begin
    begin
        update sales_configurator.clients
        set owner_cms_user_id = 'partner-b'
        where id = sales_configurator_test.id(
            'client_a',
            array['client', 'id']
        );
        raise exception 'expected client owner rejection';
    exception when others then
        if sqlerrm = 'expected client owner rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: owner cmsUserId cannot change'
            ) = 0
        then
            raise;
        end if;
    end;

    begin
        update sales_configurator.proposals
        set
            owner_cms_user_id = 'partner-b',
            client_id = sales_configurator_test.id(
                'client_b',
                array['client', 'id']
            )
        where id = sales_configurator_test.id(
            'draft_initial',
            array['proposal', 'id']
        );
        raise exception 'expected proposal owner rejection';
    exception when others then
        if sqlerrm = 'expected proposal owner rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: owner cmsUserId cannot change'
            ) = 0
        then
            raise;
        end if;
    end;
end;
$owned_rows_are_immutable$;

select sales_configurator_test.assert_true(
    (
        select client.company_name = 'Bistro A'
        from sales_configurator.clients client
        where client.id = sales_configurator_test.id(
            'client_a',
            array['client', 'id']
        )
    ),
    'cross-partner client write must not mutate the target'
);
