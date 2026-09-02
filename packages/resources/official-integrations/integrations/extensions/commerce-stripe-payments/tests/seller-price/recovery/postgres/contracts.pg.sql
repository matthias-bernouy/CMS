\set ON_ERROR_STOP on
set statement_timeout = '15s';

\ir cleanup.sql
\ir barrier.sql
\ir fixture.sql
\ir rollback.sql
\ir concurrency.sql
\ir cleanup.sql
