\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir evidence.fixture.sql

do $$
declare
    v_buyer_upload jsonb;
    v_seller_upload jsonb;
    v_buyer_download jsonb;
    v_seller_download jsonb;
    v_admin_download jsonb;
begin
    v_buyer_upload := commerce.get_claim_evidence_upload_context(
        9800000000007, 'buyer', 'order-read-buyer-a'
    );
    v_seller_upload := commerce.get_claim_evidence_upload_context(
        9800000000007, 'seller', 'order-read-seller-17'
    );
    if v_buyer_upload <> jsonb_build_object(
            'state', 'ok',
            'public_id', '40000000-0000-4000-8000-000000000007'::uuid
        )
        or v_seller_upload is distinct from v_buyer_upload then
        raise exception 'claim evidence RPC: upload context changed';
    end if;
    if commerce.get_claim_evidence_upload_context(
            9800000000007, 'buyer', 'another-buyer'
        ) <> '{"state":"not_found"}'::jsonb
        or commerce.get_claim_evidence_upload_context(
            9800000000008, 'buyer', 'order-read-buyer-b'
        ) <> '{"state":"not_found"}'::jsonb then
        raise exception 'claim evidence RPC: upload denial changed';
    end if;

    v_buyer_download := commerce.get_claim_evidence_download_context(
        9800000000033, 'buyer', 'order-read-buyer-a'
    );
    v_seller_download := commerce.get_claim_evidence_download_context(
        9800000000033, 'seller', 'order-read-seller-17'
    );
    v_admin_download := commerce.get_claim_evidence_download_context(
        9800000000034, 'admin', null
    );
    if v_buyer_download->>'state' <> 'ok'
        or v_seller_download is distinct from v_buyer_download
        or v_buyer_download->'evidence' <> jsonb_build_object(
            'storage_bucket', 'commerce-claim-evidence',
            'storage_path',
                'claims/40000000-0000-4000-8000-000000000007/seller/adverse-proof.pdf',
            'mime_type', 'application/pdf'
        )
        or v_admin_download->>'state' <> 'ok' then
        raise exception 'claim evidence RPC: download projection or visibility changed';
    end if;
    if commerce.get_claim_evidence_download_context(
            9800000000033, 'buyer', null
        ) <> '{"state":"identity_required"}'::jsonb
        or commerce.get_claim_evidence_download_context(
            9800000000033, 'buyer', 'another-buyer'
        ) <> '{"state":"claim_not_found"}'::jsonb
        or commerce.get_claim_evidence_download_context(
            9800000000034, 'buyer', 'order-read-buyer-b'
        ) <> '{"state":"claim_not_found"}'::jsonb
        or commerce.get_claim_evidence_download_context(
            9800000000999, 'admin', null
        ) <> '{"state":"evidence_not_found"}'::jsonb then
        raise exception 'claim evidence RPC: download denial precedence changed';
    end if;
end;
$$;

reset role;

do $$
declare
    v_function regprocedure;
    v_security_definer boolean;
    v_volatility "char";
    v_settings text[];
begin
    foreach v_function in array array[
        'commerce.get_claim_evidence_upload_context(bigint,text,text)'::regprocedure,
        'commerce.get_claim_evidence_download_context(bigint,text,text)'::regprocedure
    ] loop
        select procedure.prosecdef, procedure.provolatile, procedure.proconfig
        into v_security_definer, v_volatility, v_settings
        from pg_catalog.pg_proc procedure
        where procedure.oid = v_function;
        if v_security_definer or v_volatility <> 's'
            or array_position(v_settings, 'search_path=""') is null
            or pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
            or pg_catalog.has_function_privilege(
                'authenticated', v_function, 'EXECUTE'
            )
            or not pg_catalog.has_function_privilege(
                'service_role', v_function, 'EXECUTE'
            ) then
            raise exception 'claim evidence RPC: unsafe attributes or ACL';
        end if;
    end loop;
end;
$$;

rollback;
