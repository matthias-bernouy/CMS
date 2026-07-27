\set ON_ERROR_STOP on

\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled Commerce SQL bundle.'
    \quit 3
\endif

\if :{?allow_service_withdrawal_schema_reset}
\else
    \echo 'Set allow_service_withdrawal_schema_reset=true on a disposable database.'
    \quit 3
\endif

\ir install.sql

begin;
set local role service_role;
\ir fixture.sql
\ir behavior/submission.sql
\ir behavior/review.sql
rollback;
