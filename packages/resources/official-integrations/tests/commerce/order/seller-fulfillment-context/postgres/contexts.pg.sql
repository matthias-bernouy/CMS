\set ON_ERROR_STOP on

begin;

\ir security.sql
\ir assertions.sql

set local role service_role;
\ir ../../read-model/postgres/baseline.fixture.sql
\ir fixture.sql
\ir contracts.sql

rollback;
