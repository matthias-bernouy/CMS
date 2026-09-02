

create index if not exists accounts_onboarding_status_idx on stripe_connect.accounts(onboarding_status);
create index if not exists accounts_risk_status_idx on stripe_connect.accounts(risk_status);