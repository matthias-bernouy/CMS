begin;

create function payment_projection_test.fail_outbox_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if pg_catalog.right(new.projection_key, 64) in (
        pg_catalog.repeat('e', 64), pg_catalog.repeat('f', 64)
    ) then
        raise exception 'payment projection: injected outbox failure';
    end if;
    return new;
end;
$$;

create trigger payment_projection_rollback_outbox
after insert on stripe_connect.commerce_projection_outbox
for each row execute function payment_projection_test.fail_outbox_write();

create function payment_projection_test.fail_quarantine_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.event_type = 'provider_payment_truth_mismatch'
       and exists (
           select 1 from stripe_connect.payments payment
           where payment.id = new.payment_id
             and payment.client_reference_id =
                'payment-projection-pg-event-best-effort'
       ) then
        raise exception 'payment projection: injected best-effort event failure';
    end if;
    return new;
end;
$$;

create trigger payment_projection_rollback_event
after insert on stripe_connect.payment_events
for each row execute function payment_projection_test.fail_quarantine_event();

set local role service_role;

do $apply_rollback$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_error text;
begin
    v_payment_id := payment_projection_test.seed('rollback-apply');
    v_expected := payment_projection_test.snapshot(v_payment_id);
    begin
        perform stripe_connect.apply_payment_provider_projection(
            v_payment_id,
            v_expected,
            payment_projection_test.apply_projection(
                v_payment_id,
                'payment:' || v_payment_id
                    || ':provider-sync:succeeded:ch_payment_projection_'
                    || v_payment_id || ':'
                    || pg_catalog.repeat('e', 64),
                '2026-07-21 08:04:00+00'
            )
        );
        raise exception 'payment projection: outbox failure was not reached';
    exception when others then
        get stacked diagnostics v_error = message_text;
        if v_error <> 'payment projection: injected outbox failure' then
            raise exception 'payment projection: unexpected apply failure: %',
                v_error;
        end if;
    end;
    if payment_projection_test.snapshot(v_payment_id)
            is distinct from v_expected
       or exists (
           select 1 from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
       ) then
        raise exception 'payment projection: apply failure left partial state';
    end if;
end;
$apply_rollback$;

do $quarantine_rollback$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_error text;
begin
    v_payment_id := payment_projection_test.seed('rollback-quarantine');
    v_expected := payment_projection_test.snapshot(v_payment_id);
    begin
        perform stripe_connect.apply_payment_provider_projection(
            v_payment_id,
            v_expected,
            payment_projection_test.quarantine_projection(
                v_payment_id,
                'payment:' || v_payment_id || ':provider-sync:quarantine:'
                    || pg_catalog.repeat('f', 64),
                '2026-07-21 08:05:00+00'
            )
        );
        raise exception 'payment projection: outbox failure was not reached';
    exception when others then
        get stacked diagnostics v_error = message_text;
        if v_error <> 'payment projection: injected outbox failure' then
            raise exception
                'payment projection: unexpected quarantine failure: %',
                v_error;
        end if;
    end;
    if payment_projection_test.snapshot(v_payment_id)
            is distinct from v_expected
       or exists (
           select 1 from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
       ) or exists (
           select 1 from stripe_connect.provider_exceptions
           where payment_id = v_payment_id
       ) or exists (
           select 1 from stripe_connect.payment_events
           where payment_id = v_payment_id
       ) then
        raise exception
            'payment projection: quarantine failure left partial state';
    end if;
end;
$quarantine_rollback$;

do $best_effort_event$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_payment jsonb;
    v_result jsonb;
begin
    v_payment_id := payment_projection_test.seed('event-best-effort');
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.quarantine_projection(
            v_payment_id,
            'payment:' || v_payment_id || ':provider-sync:quarantine:'
                || pg_catalog.repeat('a', 64),
            '2026-07-21 08:05:30+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or v_payment->>'settlement_status' <> 'manual_review'
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id) <> 1
       or (select pg_catalog.count(*)
           from stripe_connect.provider_exceptions
           where payment_id = v_payment_id) <> 1
       or exists (
           select 1 from stripe_connect.payment_events
           where payment_id = v_payment_id
       ) then
        raise exception
            'payment projection: best-effort event failure diverged: %',
            v_result;
    end if;
end;
$best_effort_event$;

rollback;
