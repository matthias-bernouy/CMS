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
\ir contributions.sql
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
select commerce_liability_test.seed_order('race-a', 10000);
select commerce_liability_test.seed_order('race-b', 20000);
commit;

\ir concurrency/barrier.sql
\ir concurrency/races.sql
