do $migration_contract$
declare
    v_table text;
    v_function text;
begin
    if (
        select count(*)
        from information_schema.columns
        where (table_schema, table_name, column_name) in (
            ('commerce', 'settings', 'buyer_legal_acceptance_enabled'),
            ('commerce', 'buyer_legal_documents', 'current_version_id'),
            ('commerce', 'buyer_legal_document_versions', 'page_content'),
            ('commerce', 'buyer_legal_document_versions', 'content_hash'),
            ('commerce', 'buyer_legal_document_versions', 'materialization_hash'),
            ('commerce', 'order_buyer_legal_acceptances', 'payment_attempt_id'),
            ('commerce', 'order_buyer_legal_acceptances', 'correlation_id')
        )
    ) <> 7 then
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
        'commerce.sync_buyer_legal_documents(boolean,jsonb,text)',
        'commerce.get_buyer_legal_requirements(bigint,text)',
        'commerce.record_buyer_legal_acceptances(bigint,uuid,bigint,text,uuid[],uuid)',
        'commerce.get_buyer_legal_acceptance_audit(bigint,text)',
        'commerce.prepare_protected_payment(bigint,text,uuid[],text,uuid)'
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

    if pg_get_functiondef(
        'commerce.record_buyer_legal_acceptances(bigint,uuid,bigint,text,uuid[],uuid)'::regprocedure
    ) not like '%pg_advisory_xact_lock(hashtextextended(%commerce:buyer-legal-documents%'
       or pg_get_functiondef(
            'commerce.record_buyer_legal_acceptances(bigint,uuid,bigint,text,uuid[],uuid)'::regprocedure
        ) not like '%required.id = ANY (v_required_ids)%' then
        raise exception 'buyer legal proof insertion is not pinned to the atomically validated versions';
    end if;
end;
$migration_contract$;
