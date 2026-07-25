do $submission_contract$
declare
    v_first jsonb;
    v_replay jsonb;
    v_list jsonb;
    v_request_id bigint;
begin
    begin
        perform commerce.submit_marketplace_service_withdrawal_request(
            4201, 'service-withdrawal-buyer', 'marketplace.buyer_service',
            null, false, 'service-withdrawal-click'
        );
        raise exception 'test: unconfirmed service withdrawal was accepted';
    exception when others then
        if sqlerrm not like 'validation: explicit confirmation is required%' then
            raise;
        end if;
    end;
    begin
        perform commerce.submit_marketplace_service_withdrawal_request(
            4201, 'another-buyer', 'marketplace.buyer_service',
            null, true, 'another-buyer-click'
        );
        raise exception 'test: a different buyer submitted against the order';
    exception when others then
        if sqlerrm not like 'not_found: order%' then
            raise;
        end if;
    end;

    v_first := commerce.submit_marketplace_service_withdrawal_request(
        4201,
        'service-withdrawal-buyer',
        'marketplace.buyer_service',
        'Please review my request.',
        true,
        'service-withdrawal-click'
    );
    v_request_id := (v_first->>'id')::bigint;
    if (v_first->>'idempotent_replay')::boolean
        or v_first->>'status' <> 'submitted'
        or v_first->>'confirmation_key' <> 'marketplace_service_withdrawal_request.v1'
        or jsonb_array_length(v_first->'legal_acceptances_snapshot') <> 1
        or v_first->'legal_acceptances_snapshot'->0->>'document_version_id'
            <> '019c0000-0000-7000-8000-000000000003'
        or v_first->'legal_acceptances_snapshot'->0->>'content_hash' <> repeat('a', 64)
        or jsonb_array_length(v_first->'events') <> 1 then
        raise exception 'service withdrawal submission projection changed: %', v_first;
    end if;

    v_replay := commerce.submit_marketplace_service_withdrawal_request(
        4201,
        'service-withdrawal-buyer',
        'marketplace.buyer_service',
        'Please review my request.',
        true,
        'service-withdrawal-click'
    );
    if not (v_replay->>'idempotent_replay')::boolean
        or (v_replay->>'id')::bigint <> v_request_id
        or (select count(*) from commerce.marketplace_service_withdrawal_requests) <> 1
        or (select count(*) from commerce.marketplace_service_withdrawal_events) <> 1
        or (select count(*) from commerce.audit_events
            where aggregate_type = 'marketplace_service_withdrawal_request') <> 1 then
        raise exception 'service withdrawal replay was not exactly once: %', v_replay;
    end if;

    begin
        perform commerce.submit_marketplace_service_withdrawal_request(
            4201, 'service-withdrawal-buyer', 'marketplace.other_service',
            'Changed payload', true, 'service-withdrawal-click'
        );
        raise exception 'test: an idempotency key accepted a different payload';
    exception when others then
        if sqlerrm not like 'conflict: idempotency key was already used%' then
            raise;
        end if;
    end;
    begin
        perform commerce.submit_marketplace_service_withdrawal_request(
            4201, 'service-withdrawal-buyer', 'marketplace.buyer_service',
            null, true, 'second-click'
        );
        raise exception 'test: duplicate order and scope request was accepted';
    exception when others then
        if sqlerrm not like 'conflict: a service withdrawal request already exists%' then
            raise;
        end if;
    end;

    v_list := commerce.list_marketplace_service_withdrawal_requests(
        'service-withdrawal-buyer', null, null, 4201, null, null, 50, 0
    );
    if (v_list->>'total')::integer <> 1
        or v_list->'items'->0->>'buyer_cms_user_id' <> 'service-withdrawal-buyer'
        or (commerce.list_marketplace_service_withdrawal_requests(
            'another-buyer', null, null, null, null, null, 50, 0
        )->>'total')::integer <> 0 then
        raise exception 'service withdrawal buyer read boundary changed: %', v_list;
    end if;
end;
$submission_contract$;
