\set ON_ERROR_STOP on

set statement_timeout = '15s';

\ir cleanup.sql

begin;
set local role service_role;
\ir fixture.sql
\ir contracts.sql
\ir boundaries.sql
\ir inventory-idempotence.sql
rollback;

\ir concurrency.sql
\ir cleanup.sql
