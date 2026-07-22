select pg_catalog.pg_advisory_lock(743001);
select dblink_connect(
    'seller_price_a',
    'dbname=' || current_database()
        || ' application_name=seller_price_submission_a'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'seller_price_b',
    'dbname=' || current_database()
        || ' application_name=seller_price_submission_b'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('seller_price_a', 'set role service_role');
select dblink_exec('seller_price_b', 'set role service_role');
select dblink_send_query(
    'seller_price_a',
    'select seller_price_submission_test.attempt() as result'
);
select seller_price_submission_test.wait_until_blocked(
    'seller_price_submission_a'
);
select dblink_send_query(
    'seller_price_b',
    'select seller_price_submission_test.attempt() as result'
);
select seller_price_submission_test.wait_until_blocked(
    'seller_price_submission_b'
);
select pg_catalog.pg_advisory_unlock(743001);

create temporary table seller_price_results (result jsonb);
insert into seller_price_results
select result
from dblink_get_result('seller_price_a') as response(result jsonb);
insert into seller_price_results
select result
from dblink_get_result('seller_price_b') as response(result jsonb);

do $assert_concurrency$
declare
    v_state seller_price_submission_test.state%rowtype;
    v_offer_version integer;
    v_proposals bigint;
    v_events bigint;
    v_mutations bigint;
    v_offer commerce.offers%rowtype;
    v_proposal commerce.offer_price_proposals%rowtype;
    v_success jsonb;
    v_expected_success jsonb;
begin
    select * into v_state from seller_price_submission_test.state limit 1;
    select * into v_offer
    from commerce.offers where id = v_state.offer_id;
    v_offer_version := v_offer.version;
    select * into v_proposal
    from commerce.offer_price_proposals
    where offer_id = v_state.offer_id;
    select result into v_success
    from seller_price_results
    where result->>'state' = 'ok';
    v_expected_success := pg_catalog.jsonb_build_object(
        'state', 'ok',
        'result', pg_catalog.jsonb_build_object(
            'offer', to_jsonb(v_offer),
            'proposal', to_jsonb(v_proposal)
        )
    );
    select pg_catalog.count(*) into v_proposals
    from commerce.offer_price_proposals
    where offer_id = v_state.offer_id;
    select pg_catalog.count(*) into v_events
    from commerce.offer_events
    where offer_id = v_state.offer_id;
    select pg_catalog.count(*) into v_mutations
    from seller_price_submission_test.mutations;

    if (select pg_catalog.count(*) from seller_price_results) <> 2
       or (select pg_catalog.count(*) from seller_price_results
           where result->>'state' = 'ok') <> 1
       or (select pg_catalog.count(*) from seller_price_results
           where result = pg_catalog.jsonb_build_object(
               'state', 'error',
               'message', 'conflict: stale offer version'
           )) <> 1
       or v_success is distinct from v_expected_success
       or v_offer_version is distinct from v_state.expected_version + 1
       or v_offer.workflow_state is distinct from 'awaiting_final_approval'
       or v_offer.publication_status is distinct from 'draft'
       or v_offer.accepted_price_amount is not null
       or v_offer.currency is distinct from 'eur'
       or v_proposals is distinct from 1
       or v_proposal.offer_id is distinct from v_state.offer_id
       or v_proposal.amount is distinct from 12000
       or v_proposal.currency is distinct from 'eur'
       or v_proposal.status is distinct from 'pending'
       or v_proposal.proposed_by is distinct from
          'seller-price-concurrency-user'
       or v_proposal.decided_by is not null
       or v_proposal.decision_reason is not null
       or v_proposal.decided_at is not null
       or v_events is distinct from v_state.baseline_event_count + 1
       or v_mutations is distinct from 1 then
        raise exception 'seller price concurrency diverged: %',
            pg_catalog.jsonb_build_object(
                'results', (select pg_catalog.jsonb_agg(result)
                    from seller_price_results),
                'offerVersion', v_offer_version,
                'expectedVersion', v_state.expected_version,
                'proposals', v_proposals,
                'events', v_events,
                'mutations', v_mutations
            );
    end if;
end;
$assert_concurrency$;

set role service_role;
do $assert_replay$
declare
    v_state seller_price_submission_test.state%rowtype;
    v_replay jsonb;
    v_offer_version integer;
    v_proposals bigint;
    v_events bigint;
begin
    if current_user <> 'service_role' then
        raise exception 'seller price: replay did not run as service_role';
    end if;
    select * into v_state from seller_price_submission_test.state limit 1;
    v_replay := seller_price_submission_test.attempt();
    select version into v_offer_version
    from commerce.offers where id = v_state.offer_id;
    select pg_catalog.count(*) into v_proposals
    from commerce.offer_price_proposals
    where offer_id = v_state.offer_id;
    select pg_catalog.count(*) into v_events
    from commerce.offer_events
    where offer_id = v_state.offer_id;
    if v_replay is distinct from pg_catalog.jsonb_build_object(
        'state', 'error',
        'message', 'conflict: stale offer version'
    ) or v_offer_version is distinct from v_state.expected_version + 1
       or v_proposals is distinct from 1
       or v_events is distinct from v_state.baseline_event_count + 1 then
        raise exception 'seller price replay diverged: %', v_replay;
    end if;
end;
$assert_replay$;
reset role;

select dblink_disconnect('seller_price_a');
select dblink_disconnect('seller_price_b');
drop table seller_price_results;
