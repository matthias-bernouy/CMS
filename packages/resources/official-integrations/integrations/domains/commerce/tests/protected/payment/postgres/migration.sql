do $migration_contract$
declare
    v_table text;
    v_function text;
    v_record_definition text;
    v_refresh_definition text;
    v_sync_definition text;
    v_validate_definition text;
begin
    if (
        select count(*)
        from information_schema.columns
        where (table_schema, table_name, column_name) in (
            ('commerce', 'settings', 'buyer_legal_acceptance_enabled'),
            ('commerce', 'settings', 'buyer_legal_snapshot_origin'),
            ('commerce', 'buyer_legal_documents', 'current_version_id'),
            ('commerce', 'buyer_legal_documents', 'published_snapshot_url'),
            ('commerce', 'buyer_legal_document_versions', 'page_content'),
            ('commerce', 'buyer_legal_document_versions', 'content_hash'),
            ('commerce', 'buyer_legal_document_versions', 'materialization_hash'),
            ('commerce', 'order_buyer_legal_acceptances', 'payment_attempt_id'),
            ('commerce', 'order_buyer_legal_acceptances', 'correlation_id')
        )
    ) <> 9 then
        raise exception 'buyer legal migration columns are incomplete';
    end if;

    foreach v_table in array array[
        'buyer_legal_documents',
        'buyer_legal_document_versions',
        'order_buyer_legal_acceptances'
    ]
    loop
        if not exists (
            select 1
            from pg_class relation
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'commerce'
              and relation.relname = v_table
              and relation.relrowsecurity
              and relation.relforcerowsecurity
        ) then
            raise exception 'buyer legal RLS is not enabled and forced on %', v_table;
        end if;
    end loop;

    foreach v_function in array array[
        'commerce.buyer_legal_published_page_hash(text,text,text,text,text)',
        'commerce.validate_buyer_legal_sync_document(jsonb,text)',
        'commerce.materialize_buyer_legal_sync_document(text,boolean,text,text,text[],text,text,text,text,jsonb,text,text,text,text)',
        'commerce.sync_buyer_legal_documents(boolean,jsonb,text,text)',
        'commerce.buyer_legal_checkout_context(bigint)',
        'commerce.buyer_legal_required_versions(bigint)',
        'commerce.get_buyer_legal_requirements(bigint,text,text)',
        'commerce.get_buyer_legal_verification_context(bigint,text,text)',
        'commerce.get_fresh_buyer_legal_requirements(bigint,text,text,jsonb)',
        'commerce.buyer_legal_snapshot_refresh_required(jsonb)',
        'commerce.refresh_buyer_legal_document_snapshots(jsonb,text)',
        'commerce.buyer_legal_acceptance_projection(bigint,uuid[])',
        'commerce.record_buyer_legal_acceptances(bigint,uuid,bigint,text,uuid[],uuid)',
        'commerce.record_verified_buyer_legal_acceptances(bigint,uuid,bigint,text,uuid[],uuid,jsonb)',
        'commerce.get_buyer_legal_acceptance_audit(bigint,text)',
        'commerce.prepare_protected_payment(bigint,text,uuid[],text,uuid,jsonb)'
    ]
    loop
        if to_regprocedure(v_function) is null then
            raise exception 'buyer legal function is missing: %', v_function;
        end if;
    end loop;

    if (
        select column_default
        from information_schema.columns
        where table_schema = 'commerce'
          and table_name = 'settings'
          and column_name = 'buyer_legal_acceptance_enabled'
    ) <> 'false' then
        raise exception 'buyer legal acceptance must be disabled by default';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'commerce.order_payment_attempts'::regclass
          and conname = 'order_payment_attempts_provider'
          and pg_get_constraintdef(oid) like '%a-z0-9_.-%'
    ) then
        raise exception 'payment attempt provider is not a generic provider key';
    end if;

    v_record_definition := regexp_replace(pg_get_functiondef(
        'commerce.record_buyer_legal_acceptances(bigint,uuid,bigint,text,uuid[],uuid)'::regprocedure
    ), '[[:space:]]+', '', 'g');
    if v_record_definition not like
            '%pg_advisory_xact_lock_shared(hashtextextended(''commerce:buyer-legal-documents'',0))%'
       or v_record_definition not like '%required.id=any(v_required_ids)%'
       or v_record_definition not like
            '%proof.document_version_id=required.version_id%'
       or v_record_definition not like
            '%buyer_legal_acceptance_projection(p_payment_attempt_id,v_required_ids)%' then
        raise exception 'buyer legal proof insertion is not pinned to the atomically validated versions';
    end if;
    v_refresh_definition := regexp_replace(pg_get_functiondef(
        'commerce.refresh_buyer_legal_document_snapshots(jsonb,text)'::regprocedure
    ), '[[:space:]]+', '', 'g');
    v_sync_definition := regexp_replace(pg_get_functiondef(
        'commerce.sync_buyer_legal_documents(boolean,jsonb,text,text)'::regprocedure
    ), '[[:space:]]+', '', 'g');
    v_validate_definition := regexp_replace(pg_get_functiondef(
        'commerce.validate_buyer_legal_sync_document(jsonb,text)'::regprocedure
    ), '[[:space:]]+', '', 'g');
    if v_refresh_definition not like
            '%pg_advisory_xact_lock(hashtextextended(''commerce:buyer-legal-documents'',0))%'
       or v_sync_definition not like '%p_snapshot_origin%'
       or v_sync_definition not like '%validate_buyer_legal_sync_document%'
       or v_validate_definition not like '%buyer_legal_published_page_hash%' then
        raise exception 'buyer legal snapshot publication lock or canonical hash contract changed';
    end if;
    if exists (
        select 1
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname like '%buyer_legal%'
          and (
              procedure.prosecdef
              or not coalesce(
                  procedure.proconfig @> array['search_path=""'],
                  false
              )
          )
    ) then
        raise exception 'buyer legal functions must be security invoker with an empty search path';
    end if;
    if (
        select count(*)
        from pg_trigger trigger_row
        where trigger_row.tgrelid in (
            'commerce.buyer_legal_document_versions'::regclass,
            'commerce.order_buyer_legal_acceptances'::regclass
        )
          and not trigger_row.tgisinternal
          and trigger_row.tgname in (
              'buyer_legal_document_versions_immutable',
              'order_buyer_legal_acceptances_immutable',
              'order_buyer_legal_acceptances_consistent'
          )
    ) <> 3 then
        raise exception 'buyer legal immutability or consistency triggers are incomplete';
    end if;
end;
$migration_contract$;
