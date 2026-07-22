create function seller_price_submission_test.inject_rollback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_state seller_price_submission_test.state%rowtype;
begin
    select * into v_state
    from seller_price_submission_test.state
    where offer_id = new.offer_id;
    if not found or new.event_type <> 'price_submitted' then
        return new;
    end if;
    if not exists (
        select 1
        from commerce.offer_price_proposals
        where offer_id = v_state.offer_id
          and amount = 12000
          and status = 'pending'
          and proposed_by = 'seller-price-concurrency-user'
    ) or not exists (
        select 1
        from commerce.offers
        where id = v_state.offer_id
          and version = v_state.expected_version + 1
          and workflow_state = 'awaiting_final_approval'
    ) then
        raise exception 'seller price: rollback injection preceded writes';
    end if;
    raise exception 'seller price: injected rollback after writes';
end;
$$;

revoke all on function seller_price_submission_test.inject_rollback()
from public;
create trigger seller_price_submission_rollback_injection
after insert on commerce.offer_events
for each row execute function seller_price_submission_test.inject_rollback();

set role service_role;
do $assert_validation$
declare
    v_state seller_price_submission_test.state%rowtype;
begin
    if current_user <> 'service_role' then
        raise exception 'seller price: validation did not run as service_role';
    end if;
    select * into v_state from seller_price_submission_test.state limit 1;
    begin
        perform commerce.submit_offer_price(
            v_state.offer_id,
            'seller-price-concurrency-user',
            10000,
            v_state.expected_version
        );
        raise exception 'seller price: out-of-range amount was accepted';
    exception when others then
        if sqlerrm = 'seller price: out-of-range amount was accepted'
           or sqlerrm not like
              'validation: price must be between 11000 and 15000%' then
            raise;
        end if;
    end;
end;
$assert_validation$;

do $assert_rollback$
declare
    v_state seller_price_submission_test.state%rowtype;
    v_proposals bigint;
    v_events bigint;
    v_mutations bigint;
begin
    if current_user <> 'service_role' then
        raise exception 'seller price: rollback did not run as service_role';
    end if;
    select * into v_state from seller_price_submission_test.state limit 1;
    begin
        perform commerce.submit_offer_price(
            v_state.offer_id,
            'seller-price-concurrency-user',
            12000,
            v_state.expected_version
        );
        raise exception 'seller price: rollback injection was not reached';
    exception when others then
        if sqlerrm <> 'seller price: injected rollback after writes' then
            raise;
        end if;
    end;
    select pg_catalog.count(*) into v_proposals
    from commerce.offer_price_proposals
    where offer_id = v_state.offer_id;
    select pg_catalog.count(*) into v_events
    from commerce.offer_events
    where offer_id = v_state.offer_id;
    select pg_catalog.count(*) into v_mutations
    from seller_price_submission_test.mutations;
    if v_proposals is distinct from 0
       or v_events is distinct from v_state.baseline_event_count
       or v_mutations is distinct from 0
       or not exists (
           select 1 from commerce.offers
           where id = v_state.offer_id
             and version = v_state.expected_version
             and workflow_state = 'awaiting_seller_price'
             and accepted_price_amount is null
       ) then
        raise exception 'seller price rollback diverged';
    end if;
end;
$assert_rollback$;
reset role;

drop trigger seller_price_submission_rollback_injection
on commerce.offer_events;
drop function seller_price_submission_test.inject_rollback();
