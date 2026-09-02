begin;
set local role service_role;

do $null_validation_contract$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_case jsonb;
    v_cases jsonb;
    v_error text;
    v_apply_key text;
    v_quarantine_key text;
begin
    v_payment_id := payment_projection_test.seed('null-validation');
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_apply_key := 'payment:' || v_payment_id
        || ':provider-sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('a', 64);
    v_quarantine_key := 'payment:' || v_payment_id
        || ':provider-sync:quarantine:' || pg_catalog.repeat('b', 64);
    v_cases := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
            'projection', payment_projection_test.apply_projection(
                v_payment_id, v_apply_key, '2026-07-21 08:09:00+00'
            ) || pg_catalog.jsonb_build_object('kind', null),
            'message', 'validation: invalid payment provider projection kind'
        ),
        pg_catalog.jsonb_build_object(
            'projection', payment_projection_test.apply_projection(
                v_payment_id, v_apply_key, '2026-07-21 08:09:00+00'
            ) || pg_catalog.jsonb_build_object('paymentStatus', null),
            'message', 'validation: invalid apply payment provider projection'
        ),
        pg_catalog.jsonb_build_object(
            'projection', payment_projection_test.quarantine_projection(
                v_payment_id, v_quarantine_key, '2026-07-21 08:09:00+00'
            ) || pg_catalog.jsonb_build_object('actorKind', null),
            'message', 'validation: invalid quarantine payment provider projection'
        )
    );
    for v_case in
        select test_case.value
        from pg_catalog.jsonb_array_elements(v_cases) test_case(value)
    loop
        begin
            perform stripe_connect.apply_payment_provider_projection(
                v_payment_id, v_expected, v_case->'projection'
            );
            raise exception 'payment projection: null case was accepted';
        exception when others then
            get stacked diagnostics v_error = message_text;
            if v_error is distinct from v_case->>'message' then
                raise exception 'payment projection: null rejection changed: %',
                    v_error;
            end if;
        end;
    end loop;
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
        raise exception 'payment projection: null rejection wrote state';
    end if;
end;
$null_validation_contract$;

rollback;
