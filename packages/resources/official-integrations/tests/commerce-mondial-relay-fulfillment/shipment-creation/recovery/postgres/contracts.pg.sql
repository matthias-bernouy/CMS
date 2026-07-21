\set ON_ERROR_STOP on
set statement_timeout = '15s';

\ir cleanup.sql
\ir ../../../../commerce/order/read-model/postgres/baseline.fixture.sql
\ir barrier.sql
\ir concurrency.sql
\ir cleanup.sql
