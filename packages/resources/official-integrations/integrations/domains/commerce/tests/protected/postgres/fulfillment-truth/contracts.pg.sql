\set ON_ERROR_STOP on

\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to an assembled Commerce SQL bundle.'
    \quit 3
\endif

\if :{?run_fulfillment_truth_contract}
\else
    \echo 'Set run_fulfillment_truth_contract=true to run this contract.'
    \quit 3
\endif

\if :{?allow_fulfillment_truth_schema_reset}
\else
    \echo 'Set allow_fulfillment_truth_schema_reset=true on a disposable database.'
    \quit 3
\endif

drop schema if exists commerce cascade;

do $roles$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end;
$roles$;

\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

grant usage on schema extensions to service_role;
grant execute on all functions in schema extensions to service_role;

begin;
set local role service_role;

select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Carrier truth contract policy',
        'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 50,
        'estimatedCarrierCostAmount', 100,
        'platformRiskReserveContributionAmount', 50,
        'configuredMinimumMarginAmount', 100,
        'buyerFeeFixedAmount', 500,
        'buyerFeeRefundPolicy', 'resolution_defined',
        'sellerFeeRateBps', 0,
        'sellerReserveRateBps', 0,
        'financeReviewThresholdAmount', 100000,
        'dualApprovalThresholdAmount', 100000
    ),
    'carrier-truth-contract',
    (select version from commerce.settings where id = 'default')
);

\ir fixtures.sql
\ir carrier-loss.sql
\ir scan-grace.sql

rollback;
