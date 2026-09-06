do $owner_and_grants$
declare v_order commerce_buyer_legal_test.orders%rowtype; v_role text; v_audit jsonb;
begin
    select * into strict v_order from commerce_buyer_legal_test.orders where label = 'required';
    begin
        perform commerce.prepare_protected_payment(v_order.order_id, 'another-buyer');
        raise exception 'test: wrong buyer prepared a payment';
    exception when others then
        if sqlerrm <> 'not_found: order' then raise; end if;
    end;
    begin
        perform commerce.get_buyer_legal_acceptance_audit(v_order.order_id, 'another-buyer');
        raise exception 'test: wrong buyer read evidence';
    exception when others then
        if sqlerrm <> 'not_found: order' then raise; end if;
    end;
    v_audit := commerce.get_buyer_legal_acceptance_audit(v_order.order_id, v_order.buyer_cms_user_id);
    perform commerce_buyer_legal_test.assert_true(jsonb_array_length(v_audit->'consentReferences') = 3
        and v_audit->'acceptances' = '[]'::jsonb,
        'Commerce audit must link Consent receipts without duplicating their document snapshots');
    foreach v_role in array array['anon','authenticated'] loop
        if has_table_privilege(v_role, 'commerce.order_consent_acceptances', 'SELECT')
            or has_table_privilege(v_role, 'commerce.order_consent_acceptances', 'INSERT')
            or has_function_privilege(v_role, 'commerce.prepare_protected_payment(bigint,text,text,uuid,jsonb)', 'EXECUTE')
            or has_function_privilege(v_role, 'commerce.record_verified_order_consent(bigint,bigint,text,uuid,jsonb)', 'EXECUTE') then
            raise exception '% can access private payment evidence', v_role;
        end if;
    end loop;
    if not has_table_privilege('service_role', 'commerce.order_consent_acceptances', 'SELECT')
        or not has_table_privilege('service_role', 'commerce.order_consent_acceptances', 'INSERT')
        or has_table_privilege('service_role', 'commerce.order_consent_acceptances', 'UPDATE')
        or has_table_privilege('service_role', 'commerce.order_consent_acceptances', 'DELETE') then
        raise exception 'payment evidence backend privileges changed';
    end if;
end;
$owner_and_grants$;

reset role;
do $immutability_and_consistency$
declare v_proof commerce.order_consent_acceptances%rowtype;
begin
    select * into strict v_proof from commerce.order_consent_acceptances order by id limit 1;
    begin
        update commerce.order_consent_acceptances set content_hash = repeat('c',64) where id = v_proof.id;
        raise exception 'test: evidence update passed';
    exception when others then
        if sqlerrm <> 'conflict: payment consent evidence is immutable' then raise; end if;
    end;
    begin
        delete from commerce.order_consent_acceptances where id = v_proof.id;
        raise exception 'test: evidence delete passed';
    exception when others then
        if sqlerrm <> 'conflict: payment consent evidence is immutable' then raise; end if;
    end;
    begin
        insert into commerce.order_consent_acceptances (
            order_id, checkout_group_id, payment_attempt_id, buyer_cms_user_id, context_key,
            operation_key, consent_acceptance_id, document_key, document_version_id, content_hash, correlation_id, accepted_at
        ) values (
            v_proof.order_id, v_proof.checkout_group_id, v_proof.payment_attempt_id, 'another-buyer', v_proof.context_key,
            v_proof.operation_key, v_proof.consent_acceptance_id, v_proof.document_key, repeat('c',64), v_proof.content_hash, gen_random_uuid(), now()
        );
        raise exception 'test: inconsistent direct insert passed';
    exception when others then
        if sqlerrm <> 'conflict: consent evidence does not match its order and payment attempt' then raise; end if;
    end;
end;
$immutability_and_consistency$;
set local role service_role;
