


insert into commerce.settings (
    id, active_c2c_fee_policy_id, active_c2c_protection_policy_id,
    active_c2c_seller_risk_policy_id
)
select
    'default',
    (select id from commerce.fee_policies where policy_key = 'c2c-default' and version = 2),
    (select id from commerce.protection_policies where policy_key = 'c2c-default' and version = 1),
    (select id from commerce.seller_risk_policies where policy_key = 'c2c-default' and version = 2)
on conflict (id) do update set
    active_c2c_fee_policy_id = case
        when exists (
            select 1 from commerce.fee_policies unsafe_seed
            where unsafe_seed.id = commerce.settings.active_c2c_fee_policy_id
              and unsafe_seed.policy_key = 'c2c-default' and unsafe_seed.version = 1
              and unsafe_seed.created_by = 'system'
              and unsafe_seed.cost_estimates_configured = false
              and unsafe_seed.subsidy_override = true
        ) then excluded.active_c2c_fee_policy_id
        else coalesce(commerce.settings.active_c2c_fee_policy_id, excluded.active_c2c_fee_policy_id)
    end,
    active_c2c_protection_policy_id = coalesce(
        commerce.settings.active_c2c_protection_policy_id, excluded.active_c2c_protection_policy_id
    ),
    active_c2c_seller_risk_policy_id = case
        when exists (
            select 1 from commerce.seller_risk_policies unsafe_seed
            where unsafe_seed.id = commerce.settings.active_c2c_seller_risk_policy_id
              and unsafe_seed.policy_key = 'c2c-default' and unsafe_seed.version = 1
              and unsafe_seed.created_by = 'system' and unsafe_seed.reserve_rate_bps = 0
        ) then excluded.active_c2c_seller_risk_policy_id
        else coalesce(
            commerce.settings.active_c2c_seller_risk_policy_id,
            excluded.active_c2c_seller_risk_policy_id
        )
    end;

alter table commerce.settings alter column active_c2c_fee_policy_id set not null;
alter table commerce.settings alter column active_c2c_protection_policy_id set not null;
alter table commerce.settings alter column active_c2c_seller_risk_policy_id set not null;