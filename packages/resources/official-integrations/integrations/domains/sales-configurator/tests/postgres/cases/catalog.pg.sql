do $catalog_invariants$
declare
    v_draft_feature_id bigint;
begin
    v_draft_feature_id := (
        sales_configurator.upsert_catalog_feature(
            null,
            '{"code":"future-secret","name":"Future secret","status":"draft"}'
        ) #>> array['feature', 'id']
    )::bigint;

    begin
        perform sales_configurator.upsert_catalog_requirement(
            sales_configurator_test.id(
                'variant_restaurant',
                array['variant', 'id']
            ),
            v_draft_feature_id
        );
        raise exception 'expected unpublished prerequisite rejection';
    exception when others then
        if sqlerrm = 'expected unpublished prerequisite rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'published item requires only published items'
            ) = 0
        then
            raise;
        end if;
    end;

    perform sales_configurator.upsert_catalog_requirement(
        sales_configurator_test.id('module_booking', array['module', 'id']),
        sales_configurator_test.id('module_payment', array['module', 'id'])
    );
    begin
        perform sales_configurator.upsert_catalog_requirement(
            sales_configurator_test.id('module_payment', array['module', 'id']),
            sales_configurator_test.id('module_booking', array['module', 'id'])
        );
        raise exception 'expected prerequisite cycle rejection';
    exception when others then
        if sqlerrm = 'expected prerequisite cycle rejection'
            or pg_catalog.strpos(sqlerrm, 'would create a cycle') = 0
        then
            raise;
        end if;
    end;
end;
$catalog_invariants$;

set role service_role;

insert into sales_configurator_test.results (name, body)
values (
    'invalid_missing_requirement',
    sales_configurator.save_partner_proposal_draft(
        sales_configurator_test.id('partner_a', array['partner', 'id']),
        null,
        sales_configurator_test.id('client_a', array['client', 'id']),
        '{"title":"Invalid draft"}',
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
            )
        ),
        '[]'::jsonb
    )
);

select sales_configurator_test.assert_true(
    (
        select result.body ->> 'state' = 'invalid'
          and result.body ->> 'code' = 'missing_requirements'
          and pg_catalog.jsonb_array_length(
              result.body -> 'missingRequirements'
          ) >= 1
        from sales_configurator_test.results result
        where result.name = 'invalid_missing_requirement'
    ),
    'missing prerequisites must return a structured result'
);

select sales_configurator_test.assert_true(
    not exists (
        select 1
        from sales_configurator.proposals proposal
        where proposal.title = 'Invalid draft'
    ),
    'invalid selection must not create a proposal'
);

insert into sales_configurator_test.results (name, body)
values (
    'draft_initial',
    sales_configurator.save_partner_proposal_draft(
        sales_configurator_test.id('partner_a', array['partner', 'id']),
        null,
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

reset role;

select sales_configurator_test.assert_true(
    (
        select result.body #>> '{proposal,draftVersion,revision}' = '1'
          and result.body #>> '{proposal,draftVersion,fixedTotalCents}' = '65000'
          and result.body #>> '{proposal,draftVersion,quoteItemCount}' = '1'
          and pg_catalog.jsonb_array_length(
              result.body #> '{proposal,draftVersion,items}'
          ) = 7
        from sales_configurator_test.results result
        where result.name = 'draft_initial'
    ),
    'server snapshot must expand included features and calculate totals'
);

select sales_configurator_test.assert_true(
    exists (
        select 1
        from sales_configurator.proposal_items item
        where item.proposal_version_id = sales_configurator_test.id(
            'draft_initial',
            array['proposal', 'draftVersion', 'id']
        )
          and item.kind = 'feature'
          and item.origin = 'included'
          and item.label = 'Table tracking'
    ),
    'included feature must be snapshotted by the server'
);

do $catalog_parent_integrity$
begin
    begin
        insert into sales_configurator.catalog_items (
            kind,
            code,
            name,
            status
        )
        values ('feature', 'orphan-feature', 'Orphan feature', 'draft');
        set constraints all immediate;
        raise exception 'expected orphan catalogue item rejection';
    exception when others then
        if sqlerrm = 'expected orphan catalogue item rejection'
            or pg_catalog.strpos(
                sqlerrm,
                'invariant: catalogue item requires its matching subtype'
            ) = 0
        then
            raise;
        end if;
    end;
end;
$catalog_parent_integrity$;
