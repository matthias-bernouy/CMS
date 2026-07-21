\set ON_ERROR_STOP on
set statement_timeout = '15s';

-- The install contract resets stripe_connect and must only run on a disposable DB.
\if :{?run_provider_reconciliation_install_contract}
    \if :run_provider_reconciliation_install_contract
        \ir install.pg.sql
    \endif
\endif

\ir fixture.sql
\ir security.sql
\ir behavior/read-operations.sql
\ir behavior/read-contexts/payment-ledger.sql
\ir behavior/read-contexts/provider-transfer.sql
\ir behavior/read-contexts/operation-recovery.sql
\ir behavior/order-and-limit.sql
\ir behavior/batch-hydration.sql
\ir behavior/missing-references.sql
\ir behavior/retry-and-lease.sql
\ir behavior/causality.sql
\ir barrier.sql
\ir concurrency.sql

select provider_reconciliation_test.cleanup();
drop schema provider_reconciliation_test cascade;
