\set ON_ERROR_STOP on
set statement_timeout = '15s';

-- The install contract resets stripe_connect and must only run on a disposable DB.
\if :{?run_payout_schedule_install_contract}
    \if :run_payout_schedule_install_contract
        \ir install.pg.sql
    \endif
\endif

\ir fixture.sql
\ir security.sql
\ir behavior.sql
\ir barrier.sql
\ir concurrency.sql

select payout_schedule_test.cleanup();
drop schema payout_schedule_test cascade;
