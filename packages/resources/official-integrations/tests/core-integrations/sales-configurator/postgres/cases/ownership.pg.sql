set role service_role;

insert into sales_configurator.proposal_events (
    proposal_id,
    event_type,
    actor_type,
    actor_id,
    metadata
)
values (
    sales_configurator_test.id('draft_initial', array['proposal', 'id']),
    'status_changed',
    'admin',
    'local:fresh-admin',
    '{"test":"partner-redaction"}'::jsonb
);

select sales_configurator_test.assert_true(
    not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
            sales_configurator.partner_proposal_json(
                sales_configurator_test.id('draft_initial', array['proposal', 'id']),
                sales_configurator_test.id('partner_a', array['partner', 'id'])
            ) #> '{proposal,events}'
        ) event
        where event ? 'actorId'
    )
    and sales_configurator.partner_proposal_json(
        sales_configurator_test.id('draft_initial', array['proposal', 'id']),
        sales_configurator_test.id('partner_a', array['partner', 'id'])
    )::text not like '%local:fresh-admin%'
    and exists (
        select 1
        from pg_catalog.jsonb_array_elements(
            sales_configurator.admin_proposal_json(
                sales_configurator_test.id('draft_initial', array['proposal', 'id'])
            ) -> 'events'
        ) event
        where event ->> 'actorType' = 'admin'
          and event ->> 'actorId' = 'local:fresh-admin'
    )
    and not exists (
        select 1
        from sales_configurator.proposal_events event
        join sales_configurator.proposals proposal
          on proposal.id = event.proposal_id
        where event.actor_type = 'partner'
          and event.actor_id is distinct from proposal.partner_account_id::text
    ),
    'partner events must use integration ids while partner DTOs redact every audit actor'
);

do $opaque_cms_identity$
declare
    v_cms_user_id text := 'local:Opaque-Partner_123./+@test';
    v_partner jsonb;
    v_partner_id bigint;
begin
    v_partner := sales_configurator.upsert_partner_account(
        null,
        v_cms_user_id,
        '{"display_name":"Opaque partner","status":"active"}'
    );
    v_partner_id := (v_partner #>> '{partner,id}')::bigint;

    if v_partner #>> '{partner,cmsUserId}' <> v_cms_user_id then
        raise exception 'opaque CMS user id was normalized while saving';
    end if;

    perform sales_configurator.set_partner_capability(
        v_partner_id,
        'clients.manage',
        true
    );
    if sales_configurator.require_partner(
        v_cms_user_id,
        'clients.manage'
    ) <> v_partner_id then
        raise exception 'opaque CMS user id was normalized while resolving';
    end if;

    begin
        perform sales_configurator.require_partner(
            pg_catalog.lower(v_cms_user_id),
            'clients.manage'
        );
        raise exception 'expected byte-distinct CMS identity rejection';
    exception when sqlstate '42501' then
        null;
    end;

    begin
        perform sales_configurator.upsert_partner_account(
            null,
            ' local:invalid ',
            '{"display_name":"Invalid partner","status":"active"}'
        );
        raise exception 'expected whitespace-padded CMS identity rejection';
    exception when others then
        if sqlerrm = 'expected whitespace-padded CMS identity rejection'
            or pg_catalog.strpos(sqlerrm, 'cmsUserId is invalid') = 0
        then
            raise;
        end if;
    end;
end;
$opaque_cms_identity$;

select sales_configurator_test.assert_true(
    (
        sales_configurator.save_partner_client(
            sales_configurator_test.id('partner_b', array['partner', 'id']),
            sales_configurator_test.id('client_a', array['client', 'id']),
            '{"company_name":"Stolen"}'
        ) ->> 'state'
    ) = 'not_found',
    'partner B must not update partner A client'
);

select sales_configurator_test.assert_true(
    (
        sales_configurator.read_partner_proposal(
            sales_configurator_test.id('partner_b', array['partner', 'id']),
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
            sales_configurator_test.id('partner_b', array['partner', 'id']),
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
            sales_configurator_test.id('partner_b', array['partner', 'id']),
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
            sales_configurator_test.id('partner_b', array['partner', 'id']),
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
            sales_configurator_test.id('partner_b', array['partner', 'id']),
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
        perform sales_configurator.require_partner(
            'partner-b',
            'clients.manage'
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
        set partner_account_id = sales_configurator_test.id(
            'partner_b',
            array['partner', 'id']
        )
        where id = sales_configurator_test.id(
            'client_a',
            array['client', 'id']
        );
        raise exception 'expected client owner rejection';
    exception when others then
        if sqlerrm = 'expected client owner rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'immutable: partnerAccountId cannot change'
            ) = 0
        then
            raise;
        end if;
    end;

    begin
        update sales_configurator.proposals
        set
            partner_account_id = sales_configurator_test.id(
                'partner_b',
                array['partner', 'id']
            ),
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
                'immutable: partnerAccountId cannot change'
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
