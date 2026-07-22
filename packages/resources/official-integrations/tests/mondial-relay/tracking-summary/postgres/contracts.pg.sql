\set ON_ERROR_STOP on
set statement_timeout = '15s';

-- The install contract resets delivery and must only run on a disposable DB.
\if :{?run_tracking_summary_install_contract}
    \if :run_tracking_summary_install_contract
        \ir install.pg.sql
    \endif
\endif

\ir fixture.sql
\ir security.sql
\ir behavior.sql
\ir short-circuit.sql
\ir freshness.sql

select delivery_tracking_summary_test.cleanup();
drop schema delivery_tracking_summary_test cascade;
