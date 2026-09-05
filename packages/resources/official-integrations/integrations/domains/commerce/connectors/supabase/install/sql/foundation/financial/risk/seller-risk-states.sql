

create table if not exists commerce.seller_risk_states (
    seller_id bigint primary key references commerce.sellers(id) on delete restrict,
    status text not null default 'standard',
    reserve_liability_amount bigint not null default 0,
    at_risk_exposure_amount bigint not null default 0,
    outstanding_debt_amount bigint not null default 0,
    hold_reason text,
    updated_at timestamptz not null default now(),
    constraint seller_risk_states_status check (
        status in ('standard', 'monitored', 'restricted', 'blocked', 'manual_review')
    ),
    constraint seller_risk_states_amounts check (
        reserve_liability_amount between 0 and 9007199254740991
        and at_risk_exposure_amount between 0 and 9007199254740991
        and outstanding_debt_amount between 0 and 9007199254740991
    )
);