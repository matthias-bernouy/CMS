\set ON_ERROR_STOP on

set statement_timeout = '15s';

begin;
\ir fixture.sql
set local role service_role;
\ir responses.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir implementation/contributions.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir expiry.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir revisions.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir rollback.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir implementation/cache.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir implementation/dirty.sql
rollback;

begin;
\ir fixture.sql
set local track_functions = 'all';
set local role service_role;
\ir implementation/batching/settlements.sql
rollback;

begin;
\ir fixture.sql
set local track_functions = 'all';
set local role service_role;
\ir implementation/batching/payments.sql
rollback;

begin;
\ir fixture.sql
set local track_functions = 'all';
set local role service_role;
\ir implementation/batching/disputes.sql
rollback;

begin;
\ir implementation/security.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
select commerce_liability_test.seed_order('race-a', 10000);
select commerce_liability_test.seed_order('race-b', 20000);
commit;

\ir concurrency/barrier.sql
\ir concurrency/races.sql
