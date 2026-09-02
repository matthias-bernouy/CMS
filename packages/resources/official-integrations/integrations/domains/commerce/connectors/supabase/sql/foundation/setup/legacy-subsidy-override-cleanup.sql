

delete from commerce.financial_subsidy_overrides legacy_override
using commerce.fee_policies legacy_policy
where legacy_override.fee_policy_id = legacy_policy.id
  and legacy_policy.policy_key = 'c2c-default' and legacy_policy.version = 1
  and legacy_policy.created_by = 'system' and legacy_policy.cost_estimates_configured = false
  and legacy_override.approved_by = 'system'
  and legacy_override.maximum_deficit_amount = 9007199254740991
  and not exists (
      select 1 from commerce.order_financial_terms terms
      where terms.subsidy_override_id = legacy_override.id
  );