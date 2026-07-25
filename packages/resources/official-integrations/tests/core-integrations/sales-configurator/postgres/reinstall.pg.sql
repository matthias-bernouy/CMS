select sales_configurator_test.assert_true(
    pg_catalog.to_regprocedure(
        'sales_configurator.publish_partner_proposal(text,bigint,bigint,bigint)'
    ) is null
    and pg_catalog.to_regprocedure(
        'sales_configurator.publish_partner_proposal(bigint,bigint,bigint,bigint)'
    ) is not null,
    'reinstallation must preserve only the revision-aware publication RPC'
);

select sales_configurator_test.assert_true(
    (
        select pg_catalog.count(*) = 7
        from sales_configurator.catalog_items
    )
    and (
        select pg_catalog.count(*) = 1
        from sales_configurator.proposals
    )
    and (
        select pg_catalog.count(*) = 2
        from sales_configurator.proposal_versions
    )
    and (
        select pg_catalog.count(*) = 2
        from sales_configurator.proposal_shares
    ),
    'reinstallation over live data must preserve catalogue and proposal history'
);

select sales_configurator_test.assert_true(
    (
        select version.state = 'published'
          and version.revision = 1
        from sales_configurator.proposal_versions version
        where version.id = sales_configurator_test.id(
            'publish_replacement',
            array['proposal', 'publishedVersion', 'id']
        )
    )
    and (
        select pg_catalog.count(*) = 1
        from sales_configurator.proposal_versions version
        where version.proposal_id = sales_configurator_test.id(
            'publish_replacement',
            array['proposal', 'id']
        )
          and version.state = 'published'
    ),
    'reinstallation must retain exactly one current immutable snapshot'
);
