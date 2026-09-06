do $contract$
begin
    if to_regclass('commerce.order_consent_acceptances') is null
        or to_regprocedure('commerce.prepare_protected_payment(bigint,text,text,uuid,jsonb)') is null
        or to_regprocedure('commerce.record_verified_order_consent(bigint,bigint,text,uuid,jsonb)') is null then
        raise exception 'centralized consent payment contracts are missing';
    end if;
    if to_regprocedure('commerce.sync_buyer_legal_documents(boolean,jsonb,text,text)') is not null then
        raise exception 'fresh install must not own a duplicate legal policy engine';
    end if;
    if not exists (select 1 from pg_class where oid = 'commerce.order_consent_acceptances'::regclass and relrowsecurity and relforcerowsecurity) then
        raise exception 'payment evidence must force row level security';
    end if;
end;
$contract$;
