\set ON_ERROR_STOP on

set statement_timeout = '15s';

\ir read-model.sql

begin;
\ir fixture.sql
set local role service_role;
\ir matrix.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir validation/axes.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir validation/matrix.sql
rollback;

begin;
\ir fixture.sql
set local role service_role;
\ir validation/metadata.sql
rollback;

\ir lifecycle/setup.sql
\ir lifecycle/contracts.sql

begin;
\ir fixture.sql
set local role service_role;
select commerce_product_matrix_test.seed_product('race');
commit;

\ir concurrency/barrier.sql
\ir concurrency/races.sql
