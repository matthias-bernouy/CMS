\set ON_ERROR_STOP on
set statement_timeout = '15s';

-- The install contract resets stripe_connect and must only run on a disposable DB.
\if :{?run_payment_projection_install_contract}
    \if :run_payment_projection_install_contract
        \ir install.pg.sql
    \endif
\endif

\ir fixture.sql
\ir security.sql
\ir behavior/apply.sql
\ir behavior/quarantine.sql
\ir behavior/recovery.sql
\ir behavior/validation.sql
\ir rollback.sql
\ir barrier.sql
\ir concurrency.sql

select payment_projection_test.cleanup();
drop schema payment_projection_test cascade;
