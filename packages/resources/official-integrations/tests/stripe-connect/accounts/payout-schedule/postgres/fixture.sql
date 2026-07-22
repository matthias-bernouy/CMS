drop schema if exists payout_schedule_test cascade;
create schema payout_schedule_test;

create function payout_schedule_test.cleanup()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from stripe_connect.accounts
    where cms_user_id like 'payout-schedule-pg-%';
end;
$$;

create function payout_schedule_test.seed(
    p_case text,
    p_connected boolean,
    p_debt bigint default 0
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_suffix text := pg_catalog.lower(pg_catalog.btrim(p_case));
    v_user_id text;
begin
    if v_suffix !~ '^[a-z0-9-]+$' or p_connected is null or p_debt < 0 then
        raise exception 'payout schedule fixture: invalid case';
    end if;
    v_user_id := 'payout-schedule-pg-' || v_suffix;
    insert into stripe_connect.accounts (
        cms_user_id,
        stripe_account_id,
        terms_accepted,
        onboarding_status,
        payouts_enabled,
        outstanding_debt_amount
    ) values (
        v_user_id,
        case when p_connected then 'acct_payout_schedule_pg_' || v_suffix else null end,
        true,
        'enabled',
        true,
        p_debt
    );
    return v_user_id;
end;
$$;

create function payout_schedule_test.attempt(
    p_user_id text,
    p_owner text,
    p_require_risk boolean default false,
    p_require_connected_account boolean default false
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
    select stripe_connect.claim_seller_payout_hold(
        p_user_id,
        p_owner,
        p_require_risk,
        p_require_connected_account
    )
$$;

revoke all on schema payout_schedule_test from public;
revoke all on all functions in schema payout_schedule_test from public;
grant usage on schema payout_schedule_test to service_role;
grant execute on all functions in schema payout_schedule_test to service_role;

select payout_schedule_test.cleanup();
