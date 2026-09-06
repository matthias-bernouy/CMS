\set ON_ERROR_STOP on
set statement_timeout = '15s';
begin;
set local role service_role;

do $operation_contract$
declare
    v_page jsonb := jsonb_build_object(
        'id', 'operation-terms', 'path', '/terms', 'title', 'Terms',
        'description', '', 'content', '<p>Original terms</p>'
    );
    v_documents jsonb;
    v_metadata jsonb := '{"orderId":42,"checkoutGroupId":"checkout-42","paymentProvider":"test"}';
    v_version text;
    v_receipt jsonb;
    v_repeated jsonb;
    v_rejected boolean;
begin
    perform consent.bootstrap_consent_context('operation_contract', 'contract');
    v_receipt := consent.record_operation_acceptance(
        'operation_contract', 'payment:42', 'buyer-42', '{}'::text[], v_metadata
    );
    if (v_receipt->>'required')::boolean or v_receipt->>'acceptanceId' is not null then
        raise exception 'disabled policy manufactured evidence';
    end if;
    v_documents := jsonb_build_array(jsonb_build_object(
        'key', 'terms', 'enabled', true, 'label', 'Terms', 'consentText', 'I accept the Terms',
        'publishedSnapshotUrl', 'https://cms.example.test/.cms/content/published-page-snapshot?id=operation-terms',
        'page', v_page, 'contentHash', consent.published_page_hash(v_page)
    ));
    perform consent.sync_consent_context(
        'operation_contract', true, 'https://cms.example.test', v_documents, 'contract'
    );
    v_version := consent.consent_requirements_projection('operation_contract')->'documents'->0->>'versionId';
    v_rejected := false;
    begin
        perform consent.record_operation_acceptance(
            'operation_contract', 'payment:42', 'buyer-42', array[repeat('0', 64)], v_metadata
        );
    exception when others then
        if sqlerrm not like '%CONSENT_DOCUMENT_VERSION_CHANGED%' then raise; end if;
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'stale version accepted'; end if;
    v_receipt := consent.record_operation_acceptance(
        'operation_contract', 'payment:42', 'buyer-42', array[v_version], v_metadata
    );
    if v_receipt->>'cmsUserId' <> 'buyer-42'
        or v_receipt->>'operationKey' <> 'payment:42'
        or v_receipt->>'acceptanceId' is null
        or v_receipt->'documents'->0->>'versionId' <> v_version then
        raise exception 'receipt lost subject, operation, or version binding';
    end if;
    v_repeated := consent.record_operation_acceptance(
        'operation_contract', 'payment:42', 'buyer-42', '{}'::text[], v_metadata
    );
    if v_repeated <> v_receipt then raise exception 'retry changed immutable receipt'; end if;
    v_rejected := false;
    begin
        perform consent.record_operation_acceptance(
            'operation_contract', 'payment:42', 'other-buyer', array[v_version], v_metadata
        );
    exception when others then
        if sqlerrm not like '%another subject%' then raise; end if;
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'another subject reused operation'; end if;
    v_rejected := false;
    begin
        perform consent.record_operation_acceptance(
            'operation_contract', 'payment:42', 'buyer-42', array[v_version], '{"orderId":43}'
        );
    exception when others then
        if sqlerrm not like '%metadata changed%' then raise; end if;
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'another order reused operation'; end if;
    v_page := jsonb_set(v_page, '{content}', '"<p>Updated terms</p>"');
    v_documents := jsonb_set(v_documents, '{0,page}', v_page);
    v_documents := jsonb_set(v_documents, '{0,contentHash}', to_jsonb(consent.published_page_hash(v_page)));
    perform consent.sync_consent_context(
        'operation_contract', true, 'https://cms.example.test', v_documents, 'contract'
    );
    v_repeated := consent.record_operation_acceptance(
        'operation_contract', 'payment:42', 'buyer-42', array[v_version], v_metadata
    );
    if v_repeated <> v_receipt then raise exception 'policy update rewrote existing evidence'; end if;
    v_rejected := false;
    begin
        perform consent.record_operation_acceptance(
            'operation_contract', 'payment:43', 'buyer-42', array[v_version], v_metadata
        );
    exception when others then
        if sqlerrm not like '%CONSENT_DOCUMENT_VERSION_CHANGED%' then raise; end if;
        v_rejected := true;
    end;
    if not v_rejected then raise exception 'new operation accepted obsolete version'; end if;
    if has_table_privilege('service_role', 'consent.operation_acceptances', 'UPDATE, DELETE')
        or has_table_privilege('anon', 'consent.operation_acceptances', 'SELECT, INSERT')
        or has_function_privilege('authenticated',
            'consent.record_operation_acceptance(text,text,text,text[],jsonb)', 'EXECUTE') then
        raise exception 'operation evidence permissions are too broad';
    end if;
end;
$operation_contract$;

rollback;
