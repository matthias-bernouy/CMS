create schema commerce_negotiation;

revoke all on schema commerce_negotiation from public;
revoke all on schema commerce_negotiation from anon;
revoke all on schema commerce_negotiation from authenticated;

create table commerce_negotiation.proposals (
    id bigint generated always as identity primary key,
    public_id uuid not null default gen_random_uuid() unique,
    commerce_offer_id bigint not null,
    commerce_offer_slug text not null,
    commerce_offer_title text not null,
    offer_main_image_media_id bigint,
    seller_cms_user_id text not null,
    seller_display_name text not null,
    buyer_cms_user_id text not null,
    reference_amount bigint not null,
    minimum_amount bigint not null,
    maximum_amount bigint not null,
    proposed_amount bigint not null,
    currency text not null,
    buyer_message text,
    decision_message text,
    status text not null default 'pending',
    version integer not null default 1,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    commerce_agreement_id uuid,
    checkout_expires_at timestamptz,
    rejected_at timestamptz,
    withdrawn_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint negotiation_proposals_offer_positive check (commerce_offer_id > 0),
    constraint negotiation_proposals_offer_slug_not_blank check (length(btrim(commerce_offer_slug)) > 0),
    constraint negotiation_proposals_offer_title_not_blank check (length(btrim(commerce_offer_title)) > 0),
    constraint negotiation_proposals_offer_media_positive check (
        offer_main_image_media_id is null or offer_main_image_media_id > 0
    ),
    constraint negotiation_proposals_seller_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint negotiation_proposals_buyer_not_blank check (length(btrim(buyer_cms_user_id)) > 0),
    constraint negotiation_proposals_distinct_parties check (seller_cms_user_id <> buyer_cms_user_id),
    constraint negotiation_proposals_amounts check (
        reference_amount between 1 and 9007199254740991
        and minimum_amount between 1 and reference_amount
        and maximum_amount between reference_amount and 9007199254740991
        and proposed_amount between minimum_amount and maximum_amount
    ),
    constraint negotiation_proposals_currency check (currency ~ '^[a-z]{3}$'),
    constraint negotiation_proposals_messages check (
        (buyer_message is null or length(buyer_message) <= 2000)
        and (decision_message is null or length(decision_message) <= 2000)
    ),
    constraint negotiation_proposals_status check (
        status in ('pending', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded', 'canceled')
    ),
    constraint negotiation_proposals_version_positive check (version > 0),
    constraint negotiation_proposals_expiry_after_creation check (expires_at > created_at),
    constraint negotiation_proposals_checkout_link check (
        (commerce_agreement_id is null and checkout_expires_at is null)
        or (commerce_agreement_id is not null and checkout_expires_at is not null)
    ),
    constraint negotiation_proposals_commerce_agreement_fk
        foreign key (commerce_agreement_id)
        references commerce.price_agreements(public_id) on delete restrict,
    constraint negotiation_proposals_decision_timestamps check (
        (status = 'accepted' and accepted_at is not null)
        or (status = 'rejected' and rejected_at is not null)
        or (status = 'withdrawn' and withdrawn_at is not null)
        or status not in ('accepted', 'rejected', 'withdrawn')
    )
);
