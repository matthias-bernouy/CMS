do $default_disabled$
declare
    v_fixture commerce_buyer_legal_test.orders%rowtype;
    v_preparation jsonb;
begin
    select * into strict v_fixture
    from commerce_buyer_legal_test.orders where label = 'legacy-disabled';
    v_preparation := commerce.prepare_protected_payment(
        v_fixture.order_id,
        v_fixture.buyer_cms_user_id
    );
    perform commerce_buyer_legal_test.assert_true(
        v_preparation->'buyerLegalAcceptances' = '[]'::jsonb,
        'historical checkout must remain compatible while legal acceptance is disabled'
    );
end;
$default_disabled$;

do $enable_legal_documents$
declare
    v_content text := '<main><h1>Conditions de vente v1</h1></main>';
    v_hash text;
    v_result jsonb;
begin
    v_hash := commerce.buyer_legal_published_page_hash(
        'legal-cgv', '/conditions-generales-de-vente',
        'Conditions générales de vente', '', v_content
    );
    v_result := commerce.sync_buyer_legal_documents(
        true,
        jsonb_build_array(jsonb_build_object(
            'key', 'cgv',
            'label', 'Conditions générales de vente',
            'consentText', 'J''accepte les conditions générales de vente.',
            'contexts', jsonb_build_array(
                'buyer_checkout', 'direct_purchase', 'negotiated_offer'
            ),
            'page', jsonb_build_object(
                'id', 'legal-cgv',
                'path', '/conditions-generales-de-vente',
                'title', 'Conditions générales de vente',
                'description', '',
                'content', v_content,
                'contentHash', v_hash,
                'publishedSnapshotUrl',
                    'http://localhost:5000/.cms/content/published-page-snapshot?id=legal-cgv'
            )
        )),
        'http://localhost:5000',
        'buyer-legal-contract'
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_result->>'enabled')::boolean
        and v_result #>> '{documents,0,contentHash}' = v_hash
        and (
            select document.published_snapshot_url
            from commerce.buyer_legal_documents document
            where document.document_key = 'cgv'
        ) = 'http://localhost:5000/.cms/content/published-page-snapshot?id=legal-cgv'
        and (
            select settings.buyer_legal_snapshot_origin
            from commerce.settings settings where settings.id = 'default'
        ) = 'http://localhost:5000',
        'sync must persist the trusted origin, derived snapshot URL, and canonical hash'
    );
    insert into commerce_buyer_legal_test.state(key, value)
    values ('v1', v_result->'documents'->0);
end;
$enable_legal_documents$;

select commerce_buyer_legal_test.seed_order('missing-acceptance');
select commerce_buyer_legal_test.seed_order('invented-version');
select commerce_buyer_legal_test.seed_order('retry-proof');
select commerce_buyer_legal_test.seed_order('refresh-retry');
select commerce_buyer_legal_test.seed_order('multi-provider');
select commerce_buyer_legal_test.seed_order('after-republication');

do $acceptance_boundaries$
declare
    v_missing commerce_buyer_legal_test.orders%rowtype;
    v_invented commerce_buyer_legal_test.orders%rowtype;
    v_retry commerce_buyer_legal_test.orders%rowtype;
    v_refresh_retry commerce_buyer_legal_test.orders%rowtype;
    v_version_id uuid;
    v_verified jsonb;
    v_context jsonb;
    v_requirements jsonb;
    v_preparation jsonb;
    v_attempt_id bigint;
begin
    select (value->>'versionId')::uuid into strict v_version_id
    from commerce_buyer_legal_test.state where key = 'v1';
    v_verified := jsonb_build_array(
        commerce_buyer_legal_test.verified_snapshot(v_version_id)
    );
    select * into strict v_missing
    from commerce_buyer_legal_test.orders where label = 'missing-acceptance';
    v_context := commerce.get_buyer_legal_verification_context(
        v_missing.order_id, v_missing.buyer_cms_user_id, 'stripe'
    );
    v_requirements := commerce.get_fresh_buyer_legal_requirements(
        v_missing.order_id,
        v_missing.buyer_cms_user_id,
        'stripe',
        v_verified
    );
    perform commerce_buyer_legal_test.assert_true(
        v_context #>> '{documents,0,publishedSnapshotUrl}'
            = 'http://localhost:5000/.cms/content/published-page-snapshot?id=legal-cgv'
        and (v_requirements->>'enabled')::boolean
        and (v_requirements #>> '{documents,0,versionId}')::uuid = v_version_id
        and v_requirements #>> '{documents,0,pageUrl}'
            = '/conditions-generales-de-vente'
        and not (v_requirements->'documents'->0 ? 'publishedSnapshotUrl'),
        'fresh requirements must verify the trusted URL but expose only stable public fields'
    );
    begin
        perform commerce.prepare_protected_payment(
            v_missing.order_id, v_missing.buyer_cms_user_id,
            '{}'::uuid[], 'stripe', gen_random_uuid(), v_verified
        );
        raise exception 'test: missing acceptance passed';
    exception when others then
        if sqlerrm = 'test: missing acceptance passed'
           or sqlerrm <> 'validation: BUYER_LEGAL_ACCEPTANCE_REQUIRED' then
            raise;
        end if;
    end;

    select * into strict v_invented
    from commerce_buyer_legal_test.orders where label = 'invented-version';
    begin
        perform commerce.prepare_protected_payment(
            v_invented.order_id, v_invented.buyer_cms_user_id,
            array[gen_random_uuid()], 'stripe', gen_random_uuid(), v_verified
        );
        raise exception 'test: invented legal version passed';
    exception when others then
        if sqlerrm = 'test: invented legal version passed'
           or sqlerrm <> 'conflict: LEGAL_DOCUMENT_VERSION_CHANGED' then
            raise;
        end if;
    end;

    select * into strict v_retry
    from commerce_buyer_legal_test.orders where label = 'retry-proof';
    v_preparation := commerce.prepare_protected_payment(
        v_retry.order_id, v_retry.buyer_cms_user_id,
        array[v_version_id], 'stripe', gen_random_uuid(), v_verified
    );
    v_attempt_id := (v_preparation->>'paymentAttemptId')::bigint;
    perform commerce_buyer_legal_test.assert_true(
        jsonb_array_length(v_preparation->'buyerLegalAcceptances') = 1
        and (v_preparation #>> '{buyerLegalAcceptances,0,versionId}')::uuid = v_version_id
        and (
            select count(*) from commerce.order_buyer_legal_acceptances
            where payment_attempt_id = v_attempt_id
        ) = 1,
        'accepted direct checkout must create one version-pinned proof'
    );
    insert into commerce_buyer_legal_test.state(key, value)
    values ('retry-preparation', v_preparation);

    select * into strict v_refresh_retry
    from commerce_buyer_legal_test.orders where label = 'refresh-retry';
    v_preparation := commerce.prepare_protected_payment(
        v_refresh_retry.order_id, v_refresh_retry.buyer_cms_user_id,
        array[v_version_id], 'stripe', gen_random_uuid(), v_verified
    );
    insert into commerce_buyer_legal_test.state(key, value)
    values ('refresh-retry-v1-preparation', v_preparation);
end;
$acceptance_boundaries$;

do $provider_scoped_requirements$
declare
    v_fixture commerce_buyer_legal_test.orders%rowtype;
    v_version_id uuid;
    v_verified jsonb;
    v_provider_a jsonb;
    v_provider_b jsonb;
    v_context_b jsonb;
    v_public_requirements_b jsonb;
    v_fresh_requirements_b jsonb;
begin
    select * into strict v_fixture
    from commerce_buyer_legal_test.orders where label = 'multi-provider';
    select (value->>'versionId')::uuid into strict v_version_id
    from commerce_buyer_legal_test.state where key = 'v1';
    v_verified := jsonb_build_array(
        commerce_buyer_legal_test.verified_snapshot(v_version_id)
    );
    v_provider_a := commerce.prepare_protected_payment(
        v_fixture.order_id,
        v_fixture.buyer_cms_user_id,
        array[v_version_id],
        'provider-a',
        gen_random_uuid(),
        v_verified
    );
    v_context_b := commerce.get_buyer_legal_verification_context(
        v_fixture.order_id, v_fixture.buyer_cms_user_id, 'provider-b'
    );
    v_public_requirements_b := commerce.get_buyer_legal_requirements(
        v_fixture.order_id, v_fixture.buyer_cms_user_id, 'provider-b'
    );
    v_fresh_requirements_b := commerce.get_fresh_buyer_legal_requirements(
        v_fixture.order_id,
        v_fixture.buyer_cms_user_id,
        'provider-b',
        v_verified
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_context_b->>'enabled')::boolean
        and not (v_context_b->>'paymentAlreadyCreated')::boolean
        and (v_public_requirements_b->>'enabled')::boolean
        and (v_fresh_requirements_b->>'enabled')::boolean
        and (v_fresh_requirements_b #>> '{documents,0,versionId}')::uuid
            = v_version_id,
        'provider A proof must not hide current requirements from provider B'
    );
    v_provider_b := commerce.prepare_protected_payment(
        v_fixture.order_id,
        v_fixture.buyer_cms_user_id,
        array[v_version_id],
        'provider-b',
        gen_random_uuid(),
        v_verified
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_provider_a->>'paymentAttemptId')::bigint
            <> (v_provider_b->>'paymentAttemptId')::bigint
        and (
            select count(*)
            from commerce.order_payment_attempts attempt
            where attempt.order_id = v_fixture.order_id
              and attempt.provider in ('provider-a', 'provider-b')
        ) = 2
        and (
            select count(*)
            from commerce.order_buyer_legal_acceptances proof
            join commerce.order_payment_attempts attempt
              on attempt.id = proof.payment_attempt_id
            where proof.order_id = v_fixture.order_id
              and attempt.provider in ('provider-a', 'provider-b')
        ) = 2
        and not exists (
            select 1
            from commerce.order_payment_attempts attempt
            where attempt.order_id = v_fixture.order_id
              and attempt.provider in ('provider-a', 'provider-b')
              and (
                  select count(*)
                  from commerce.order_buyer_legal_acceptances proof
                  where proof.payment_attempt_id = attempt.id
              ) <> 1
        ),
        'each payment provider must own a distinct attempt-scoped legal proof'
    );
end;
$provider_scoped_requirements$;

do $republish_and_retry_boundaries$
declare
    v_retry commerce_buyer_legal_test.orders%rowtype;
    v_refresh_retry commerce_buyer_legal_test.orders%rowtype;
    v_after commerce_buyer_legal_test.orders%rowtype;
    v_v1 uuid;
    v_v2 uuid;
    v_verified_v1 jsonb;
    v_verified_v2 jsonb;
    v_refresh jsonb;
    v_preparation jsonb;
    v_retry_preparation jsonb;
begin
    select (value->>'versionId')::uuid into strict v_v1
    from commerce_buyer_legal_test.state where key = 'v1';
    v_verified_v1 := jsonb_build_array(
        commerce_buyer_legal_test.verified_snapshot(
            v_v1, '<main><h1>Conditions de vente v2</h1></main>'
        )
    );
    v_refresh := commerce.refresh_buyer_legal_document_snapshots(
        v_verified_v1, 'buyer-legal-contract-republication'
    );
    v_v2 := (v_refresh->0->>'versionId')::uuid;
    insert into commerce_buyer_legal_test.state(key, value)
    values ('v2', v_refresh->0);
    perform commerce_buyer_legal_test.assert_true(
        v_v2 <> v_v1
        and (select count(*) from commerce.buyer_legal_document_versions) = 2,
        'republishing changed content must materialize a second immutable version'
    );
    v_verified_v2 := jsonb_build_array(
        commerce_buyer_legal_test.verified_snapshot(v_v2)
    );

    select * into strict v_retry
    from commerce_buyer_legal_test.orders where label = 'retry-proof';
    begin
        perform commerce.prepare_protected_payment(
            v_retry.order_id, v_retry.buyer_cms_user_id,
            '{}'::uuid[], 'stripe', gen_random_uuid(), v_verified_v2
        );
        raise exception 'test: stale proof replay passed before provider creation';
    exception when others then
        if sqlerrm = 'test: stale proof replay passed before provider creation'
           or sqlerrm <> 'validation: BUYER_LEGAL_ACCEPTANCE_REQUIRED' then
            raise;
        end if;
    end;

    select * into strict v_refresh_retry
    from commerce_buyer_legal_test.orders where label = 'refresh-retry';
    select value into strict v_retry_preparation
    from commerce_buyer_legal_test.state
    where key = 'refresh-retry-v1-preparation';
    v_preparation := commerce.prepare_protected_payment(
        v_refresh_retry.order_id, v_refresh_retry.buyer_cms_user_id,
        array[v_v2], 'stripe', gen_random_uuid(), v_verified_v2
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_preparation->>'paymentAttemptId')::bigint
            = (v_retry_preparation->>'paymentAttemptId')::bigint
        and (v_preparation #>> '{buyerLegalAcceptances,0,versionId}')::uuid = v_v2
        and (
            select count(*)
            from commerce.order_buyer_legal_acceptances proof
            where proof.payment_attempt_id =
                (v_preparation->>'paymentAttemptId')::bigint
        ) = 2,
        'refreshing a reserved attempt must retain v1 and pin a new v2 proof'
    );
    v_preparation := commerce.prepare_protected_payment(
        v_refresh_retry.order_id, v_refresh_retry.buyer_cms_user_id,
        '{}'::uuid[], 'stripe', gen_random_uuid(), v_verified_v2
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_preparation->>'paymentAttemptId')::bigint
            = (v_retry_preparation->>'paymentAttemptId')::bigint
        and (v_preparation #>> '{buyerLegalAcceptances,0,versionId}')::uuid = v_v2
        and (
            select count(*)
            from commerce.order_payment_attempts attempt
            where attempt.order_id = v_refresh_retry.order_id
              and attempt.provider = 'stripe'
              and attempt.provider_payment_id is null
        ) = 1
        and (
            select count(*)
            from commerce.order_buyer_legal_acceptances proof
            where proof.payment_attempt_id =
                (v_preparation->>'paymentAttemptId')::bigint
        ) = 2,
        'reserved retry must reuse the current v2 proof without duplication'
    );

    select * into strict v_after
    from commerce_buyer_legal_test.orders where label = 'after-republication';
    begin
        perform commerce.prepare_protected_payment(
            v_after.order_id, v_after.buyer_cms_user_id,
            array[v_v1], 'stripe', gen_random_uuid(), v_verified_v2
        );
        raise exception 'test: old current version passed after republication';
    exception when others then
        if sqlerrm = 'test: old current version passed after republication'
           or sqlerrm <> 'conflict: LEGAL_DOCUMENT_VERSION_CHANGED' then
            raise;
        end if;
    end;
    v_preparation := commerce.prepare_protected_payment(
        v_after.order_id, v_after.buyer_cms_user_id,
        array[v_v2], 'stripe', gen_random_uuid(), v_verified_v2
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_preparation #>> '{buyerLegalAcceptances,0,versionId}')::uuid = v_v2,
        'a checkout refreshed after republication must accept the new version'
    );
end;
$republish_and_retry_boundaries$;

do $negotiated_public_flow$
declare
    v_offer commerce.offers%rowtype;
    v_agreement jsonb;
    v_checkout jsonb;
    v_order commerce.orders%rowtype;
    v_terms jsonb;
    v_preparation jsonb;
    v_v2 uuid;
begin
    select * into strict v_offer
    from commerce.offers where slug = 'buyer-legal-negotiated-offer';
    v_agreement := commerce.register_price_agreement(
        'buyer-legal-contract',
        'negotiated-public-flow',
        1,
        v_offer.id,
        'buyer-legal-contract-seller',
        'legal-buyer-negotiated-public',
        12000,
        'eur',
        1,
        now() + interval '1 hour'
    );
    v_checkout := commerce.create_order_from_price_agreement(
        'legal-buyer-negotiated-public',
        'buyer-legal-negotiated-public-checkout',
        (v_agreement->>'public_id')::uuid
    );
    select * into strict v_order
    from commerce.orders where id = (v_checkout->>'id')::bigint;
    perform commerce_buyer_legal_test.assert_true(
        v_offer.accepted_price_amount = 11000
        and v_order.subtotal_amount = 12000
        and v_order.checkout_group_id is not null
        and (
            select line.unit_amount
            from commerce.order_lines line where line.order_id = v_order.id
        ) = 12000,
        'public negotiated checkout must preserve 11000 listing and use 12000 agreement'
    );
    v_terms := commerce.lock_order_financial_terms(
        v_order.public_id,
        v_order.buyer_cms_user_id,
        'buyer-legal-negotiated-public-quote',
        0,
        'eur',
        v_order.version,
        'buyer-legal-contract'
    );
    insert into commerce_buyer_legal_test.orders (
        label, order_id, public_id, checkout_group_id,
        buyer_cms_user_id, financial_terms_hash
    ) values (
        'negotiated-public',
        v_order.id,
        v_order.public_id,
        v_order.checkout_group_id,
        v_order.buyer_cms_user_id,
        v_terms->>'financial_terms_hash'
    );
    select (value->>'versionId')::uuid into strict v_v2
    from commerce_buyer_legal_test.state where key = 'v2';
    v_preparation := commerce.prepare_protected_payment(
        v_order.id,
        v_order.buyer_cms_user_id,
        array[v_v2],
        'stripe',
        gen_random_uuid(),
        jsonb_build_array(
            commerce_buyer_legal_test.verified_snapshot(v_v2)
        )
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_preparation->>'merchandiseSubtotalMinorAmount')::bigint = 12000
        and (v_preparation #>> '{buyerLegalAcceptances,0,versionId}')::uuid = v_v2
        and exists (
            select 1
            from commerce.order_buyer_legal_acceptances proof
            where proof.order_id = v_order.id
              and proof.checkout_group_id = v_order.checkout_group_id
              and proof.document_version_id = v_v2
        ),
        'negotiated 12000 order must pass the same version-pinned legal gate'
    );
end;
$negotiated_public_flow$;

do $provider_adoption_and_audit$
declare
    v_retry commerce_buyer_legal_test.orders%rowtype;
    v_preparation jsonb;
    v_projection jsonb;
    v_replay jsonb;
    v_audit jsonb;
    v_attempt_id bigint;
    v_v1 uuid;
begin
    select * into strict v_retry
    from commerce_buyer_legal_test.orders where label = 'retry-proof';
    select value into strict v_preparation
    from commerce_buyer_legal_test.state where key = 'retry-preparation';
    select (value->>'versionId')::uuid into strict v_v1
    from commerce_buyer_legal_test.state where key = 'v1';
    v_attempt_id := (v_preparation->>'paymentAttemptId')::bigint;
    v_projection := commerce.record_order_payment_projection(
        v_retry.public_id,
        'evt_buyer_legal_provider_adoption',
        810001,
        'created',
        (v_preparation->>'buyerTotalAmount')::bigint,
        'eur',
        v_retry.financial_terms_hash,
        now(),
        '{}'::jsonb
    );
    perform commerce_buyer_legal_test.assert_true(
        (select provider_payment_id from commerce.order_payment_attempts
         where id = v_attempt_id) = 810001,
        'the first provider projection must adopt provider_payment_id'
    );
    v_replay := commerce.prepare_protected_payment(
        v_retry.order_id, v_retry.buyer_cms_user_id,
        '{}'::uuid[], 'stripe', gen_random_uuid(), '[]'::jsonb
    );
    perform commerce_buyer_legal_test.assert_true(
        (v_replay #>> '{buyerLegalAcceptances,0,versionId}')::uuid = v_v1
        and (
            select count(*) from commerce.order_buyer_legal_acceptances
            where payment_attempt_id = v_attempt_id
        ) = 1,
        'provider-created retry must reuse its exact old proof without duplication'
    );

    v_audit := commerce.get_buyer_legal_acceptance_audit(
        v_retry.order_id, v_retry.buyer_cms_user_id
    );
    perform commerce_buyer_legal_test.assert_true(
        jsonb_typeof(v_audit #> '{acceptances,0,page,content}') = 'string'
        and v_audit #>> '{acceptances,0,page,content}'
            = '<main><h1>Conditions de vente v1</h1></main>'
        and (v_audit #>> '{acceptances,0,versionId}')::uuid = v_v1,
        'audit must expose the immutable accepted string snapshot'
    );
end;
$provider_adoption_and_audit$;
