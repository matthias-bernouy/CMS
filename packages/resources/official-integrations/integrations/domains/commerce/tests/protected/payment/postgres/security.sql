do $immutability$
declare
    v_version_id uuid;
    v_acceptance_id bigint;
begin
    select (value->>'versionId')::uuid into strict v_version_id
    from commerce_buyer_legal_test.state where key = 'v1';
    select min(id) into strict v_acceptance_id
    from commerce.order_buyer_legal_acceptances;
    begin
        perform commerce_buyer_legal_test.mutate_version(v_version_id, false);
        raise exception 'test: legal version update passed';
    exception when others then
        if sqlerrm = 'test: legal version update passed'
           or sqlerrm <> 'conflict: buyer legal evidence is immutable' then
            raise;
        end if;
    end;
    begin
        perform commerce_buyer_legal_test.mutate_version(v_version_id, true);
        raise exception 'test: legal version delete passed';
    exception when others then
        if sqlerrm = 'test: legal version delete passed'
           or sqlerrm <> 'conflict: buyer legal evidence is immutable' then
            raise;
        end if;
    end;
    begin
        perform commerce_buyer_legal_test.mutate_acceptance(v_acceptance_id, false);
        raise exception 'test: legal proof update passed';
    exception when others then
        if sqlerrm = 'test: legal proof update passed'
           or sqlerrm <> 'conflict: buyer legal evidence is immutable' then
            raise;
        end if;
    end;
    begin
        perform commerce_buyer_legal_test.mutate_acceptance(v_acceptance_id, true);
        raise exception 'test: legal proof delete passed';
    exception when others then
        if sqlerrm = 'test: legal proof delete passed'
           or sqlerrm <> 'conflict: buyer legal evidence is immutable' then
            raise;
        end if;
    end;
end;
$immutability$;

do $direct_insert_consistency$
declare
    v_proof commerce.order_buyer_legal_acceptances%rowtype;
begin
    select * into strict v_proof
    from commerce.order_buyer_legal_acceptances
    order by id limit 1;
    begin
        insert into commerce.order_buyer_legal_acceptances (
            order_id, checkout_group_id, payment_attempt_id, buyer_cms_user_id,
            document_key, document_version_id, content_hash, correlation_id
        ) values (
            v_proof.order_id,
            v_proof.checkout_group_id,
            v_proof.payment_attempt_id,
            'wrong-buyer',
            v_proof.document_key,
            v_proof.document_version_id,
            v_proof.content_hash,
            gen_random_uuid()
        );
        raise exception 'test: inconsistent direct evidence insert passed';
    exception when others then
        if sqlerrm = 'test: inconsistent direct evidence insert passed'
           or sqlerrm <>
                'conflict: buyer legal evidence does not match its order and payment attempt' then
            raise;
        end if;
    end;
end;
$direct_insert_consistency$;

do $grants$
declare
    v_role text;
    v_table text;
begin
    foreach v_role in array array['anon', 'authenticated']
    loop
        if exists (
            select 1
            from pg_proc procedure
            join pg_namespace namespace
              on namespace.oid = procedure.pronamespace
            where namespace.nspname = 'commerce'
              and procedure.proname like '%buyer_legal%'
              and has_function_privilege(
                  v_role,
                  procedure.oid,
                  'EXECUTE'
              )
        ) then
            raise exception
                '% unexpectedly executes an internal buyer legal function',
                v_role;
        end if;
        foreach v_table in array array[
            'buyer_legal_documents',
            'buyer_legal_document_versions',
            'order_buyer_legal_acceptances'
        ]
        loop
            if has_table_privilege(v_role, 'commerce.' || v_table, 'SELECT')
               or has_table_privilege(v_role, 'commerce.' || v_table, 'INSERT') then
                raise exception '% unexpectedly accesses commerce.%', v_role, v_table;
            end if;
        end loop;
        if has_function_privilege(
            v_role,
            'commerce.prepare_protected_payment(bigint,text,uuid[],text,uuid,jsonb)',
            'EXECUTE'
        ) or has_function_privilege(
            v_role,
            'commerce.sync_buyer_legal_documents(boolean,jsonb,text,text)',
            'EXECUTE'
        ) or has_function_privilege(
            v_role,
            'commerce.validate_buyer_legal_sync_document(jsonb,text)',
            'EXECUTE'
        ) or has_function_privilege(
            v_role,
            'commerce.buyer_legal_acceptance_projection(bigint,uuid[])',
            'EXECUTE'
        ) then
            raise exception '% unexpectedly executes buyer legal privileged functions', v_role;
        end if;
    end loop;
    if not has_table_privilege(
        'service_role', 'commerce.buyer_legal_document_versions', 'SELECT'
    ) or not has_table_privilege(
        'service_role', 'commerce.order_buyer_legal_acceptances', 'INSERT'
    ) or has_table_privilege(
        'service_role', 'commerce.order_buyer_legal_acceptances', 'UPDATE'
    ) or has_table_privilege(
        'service_role', 'commerce.order_buyer_legal_acceptances', 'DELETE'
    ) then
        raise exception 'service_role buyer legal least-privilege grants changed';
    end if;
    if exists (
        select 1
        from pg_proc procedure
        join pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname like '%buyer_legal%'
          and not has_function_privilege(
              'service_role',
              procedure.oid,
              'EXECUTE'
          )
    ) then
        raise exception 'service_role cannot execute every buyer legal backend function';
    end if;
end;
$grants$;
