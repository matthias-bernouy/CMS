do $review_contract$
declare
    v_public_id uuid := (
        select public_id from commerce.marketplace_service_withdrawal_requests
    );
    v_review jsonb;
    v_resolved jsonb;
begin
    v_review := commerce.review_marketplace_service_withdrawal_request(
        v_public_id, 'under_review', null, 'contract-admin',
        'Eligibility review started; no order action taken.', 1
    );
    if v_review->>'status' <> 'under_review'
        or (v_review->>'version')::integer <> 2
        or jsonb_array_length(v_review->'events') <> 2 then
        raise exception 'service withdrawal review projection changed: %', v_review;
    end if;

    begin
        perform commerce.review_marketplace_service_withdrawal_request(
            v_public_id, 'information_requested', null, 'contract-admin',
            'Stale review.', 1
        );
        raise exception 'test: stale service withdrawal review was accepted';
    exception when others then
        if sqlerrm not like 'conflict: stale service withdrawal request version%' then
            raise;
        end if;
    end;

    v_resolved := commerce.review_marketplace_service_withdrawal_request(
        v_public_id, 'resolved', 'accepted', 'contract-admin',
        'Request accepted for separately authorized manual processing.', 2
    );
    if v_resolved->>'status' <> 'resolved'
        or v_resolved->>'resolution' <> 'accepted'
        or (v_resolved->>'version')::integer <> 3
        or (select count(*) from commerce.marketplace_service_withdrawal_events) <> 3
        or (select status from commerce.orders where id = 4201) <> 'active'
        or exists (select 1 from commerce.order_cancellation_requests where order_id = 4201)
        or exists (select 1 from commerce.refund_requests where order_id = 4201) then
        raise exception 'service withdrawal review caused an implicit order or financial effect: %', v_resolved;
    end if;

    begin
        perform commerce.review_marketplace_service_withdrawal_request(
            v_public_id, 'under_review', null, 'contract-admin',
            'Terminal replay.', 3
        );
        raise exception 'test: a resolved service withdrawal was reopened';
    exception when others then
        if sqlerrm not like 'conflict: service withdrawal request is already resolved%' then
            raise;
        end if;
    end;
end;
$review_contract$;

do $immutability_contract$
begin
    begin
        update commerce.marketplace_service_withdrawal_requests
        set reason = 'mutated evidence';
        raise exception 'test: service withdrawal evidence was mutable';
    exception when others then
        if sqlerrm not like 'conflict: service withdrawal request evidence is immutable%' then
            raise;
        end if;
    end;
end;
$immutability_contract$;
